import { ConflictException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { AppRequest } from '../../common/principal.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { SubscriptionEventType } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { addDays, addInterval, FREE_PERIOD_YEARS, GRACE_DAYS, LIVE_STATUSES } from './period.js';

type Tx = Prisma.TransactionClient;
type Plan = { id: string; code: string; priceMinor: bigint; interval: 'MONTH' | 'YEAR'; trialDays: number };

const actorOf = (req: AppRequest | null) => (req?.principal?.kind === 'user' ? req.principal.user.id : null);

/**
 * One live subscription per organization (enforced by a partial unique index). Every change runs in a
 * transaction that first locks the organization row, so concurrent payments/admin actions serialize.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger('Subscriptions');
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async lockOrganization(tx: Tx, organizationId: string) {
    await tx.$queryRaw`SELECT id FROM "app"."organizations" WHERE id = ${organizationId}::uuid FOR UPDATE`;
  }

  private live(tx: Tx, organizationId: string) {
    return tx.subscription.findFirst({ where: { organizationId, status: { in: [...LIVE_STATUSES] } }, include: { plan: true } });
  }

  private event(tx: Tx, subscriptionId: string, type: SubscriptionEventType, extra: { fromPlanId?: string; toPlanId?: string; actorUserId?: string | null; metadata?: object } = {}) {
    return tx.subscriptionEvent.create({
      data: { subscriptionId, type, ...extra, metadata: extra.metadata as Prisma.InputJsonValue | undefined },
    });
  }

  /** Ends the current live subscription (if any) so a new one can start. */
  private async endLive(tx: Tx, organizationId: string, status: 'CANCELED' | 'EXPIRED', type: SubscriptionEventType, actorUserId: string | null) {
    const current = await this.live(tx, organizationId);
    if (!current) return null;
    await tx.subscription.update({ where: { id: current.id }, data: { status, endedAt: new Date(), canceledAt: status === 'CANCELED' ? new Date() : undefined } });
    await this.event(tx, current.id, type, { fromPlanId: current.planId, actorUserId });
    return current;
  }

  /** Free plan subscription — the floor every organization falls back to. */
  async createFree(tx: Tx, organizationId: string, actorUserId: string | null) {
    const free = await tx.plan.findUnique({ where: { code: 'FREE' } });
    if (!free) {
      this.logger.warn('FREE plan missing — run the seed; organization keeps fallback Free rules without a subscription row');
      return null;
    }
    const now = new Date();
    const sub = await tx.subscription.create({
      data: { organizationId, planId: free.id, status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: addInterval(now, 'YEAR', FREE_PERIOD_YEARS) },
    });
    await this.event(tx, sub.id, 'CREATED', { toPlanId: free.id, actorUserId });
    return sub;
  }

  /** The live subscription, creating a Free one if the organization has none (payments need one to reference). */
  async ensureLive(tx: Tx, organizationId: string, actorUserId: string | null) {
    return (await this.live(tx, organizationId)) ?? (await this.createFree(tx, organizationId, actorUserId).then((s) => s && this.live(tx, organizationId)));
  }

  // ── organization-facing ──

  async startTrial(req: AppRequest, organizationId: string, plan: Plan & { priceMinor: bigint }) {
    if (plan.trialDays <= 0 || plan.priceMinor <= 0n) throw new UnprocessableEntityException('This plan has no trial');
    return this.db.$transaction(async (tx) => {
      await this.lockOrganization(tx, organizationId);
      const usedTrial = await tx.subscriptionEvent.count({ where: { type: 'TRIAL_STARTED', subscription: { organizationId } } });
      if (usedTrial) throw new ConflictException('This organization has already used its free trial');
      const current = await this.live(tx, organizationId);
      if (current && current.plan.priceMinor > 0n) throw new ConflictException('A paid plan is already active');

      await this.endLive(tx, organizationId, 'CANCELED', 'CANCELED', actorOf(req));
      const now = new Date();
      const end = addDays(now, plan.trialDays);
      const sub = await tx.subscription.create({
        data: { organizationId, planId: plan.id, status: 'TRIALING', currentPeriodStart: now, currentPeriodEnd: end, trialEndsAt: end },
      });
      await this.event(tx, sub.id, 'TRIAL_STARTED', { fromPlanId: current?.planId, toPlanId: plan.id, actorUserId: actorOf(req) });
      await this.audit.record(req, { action: 'subscription.trial_started', organizationId, entityType: 'subscription', entityId: sub.id, metadata: { plan: plan.code } }, tx);
      return sub;
    });
  }

  /** Cancel = stop at the end of the paid period (access is kept until then), then fall back to Free. */
  async setCancelAtPeriodEnd(req: AppRequest, organizationId: string, cancel: boolean) {
    return this.db.$transaction(async (tx) => {
      await this.lockOrganization(tx, organizationId);
      const current = await this.live(tx, organizationId);
      if (!current || current.plan.code === 'FREE') throw new ConflictException('There is no paid subscription to change');
      if (current.cancelAtPeriodEnd === cancel) return current;
      const sub = await tx.subscription.update({ where: { id: current.id }, data: { cancelAtPeriodEnd: cancel } });
      await this.event(tx, current.id, cancel ? 'CANCEL_SCHEDULED' : 'RESUMED', { actorUserId: actorOf(req) });
      await this.audit.record(req, { action: cancel ? 'subscription.cancel_scheduled' : 'subscription.resumed', organizationId, entityType: 'subscription', entityId: current.id }, tx);
      return sub;
    });
  }

  history(organizationId: string) {
    return this.db.subscription.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        plan: { select: { code: true, name: true } },
        events: { orderBy: { createdAt: 'asc' }, select: { type: true, createdAt: true, fromPlan: { select: { code: true } }, toPlan: { select: { code: true } } } },
      },
    });
  }

  // ── payments ──

  /**
   * A successful payment for `plan`: the same plan extends the period (renewal — paying early never loses days),
   * a different plan switches immediately (no proration). Returns the subscription the period belongs to.
   */
  async applyPaidPeriod(tx: Tx, organizationId: string, plan: Plan) {
    await this.lockOrganization(tx, organizationId);
    const current = await this.live(tx, organizationId);
    const now = new Date();

    if (current && current.planId === plan.id && current.status !== 'TRIALING') {
      const base = current.currentPeriodEnd > now ? current.currentPeriodEnd : now;
      const sub = await tx.subscription.update({
        where: { id: current.id },
        data: { status: 'ACTIVE', currentPeriodEnd: addInterval(base, plan.interval), cancelAtPeriodEnd: false },
      });
      await this.event(tx, sub.id, 'RENEWED', { toPlanId: plan.id });
      return sub;
    }

    const previous = await this.endLive(tx, organizationId, 'CANCELED', 'CANCELED', null);
    const sub = await tx.subscription.create({
      data: { organizationId, planId: plan.id, status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: addInterval(now, plan.interval) },
    });
    const upgrade = previous && previous.plan.priceMinor < plan.priceMinor;
    await this.event(tx, sub.id, previous ? (upgrade ? 'UPGRADED' : 'DOWNGRADED') : 'CREATED', { fromPlanId: previous?.planId, toPlanId: plan.id });
    return sub;
  }

  // ── lifecycle job ──

  /**
   * Moves subscriptions whose period ended: trials and cancelled ones expire to Free; unpaid active ones go
   * PAST_DUE for a grace period, then expire. Idempotent, safe to run any number of times.
   */
  async runLifecycle(now = new Date()) {
    const due = await this.db.subscription.findMany({
      where: {
        OR: [
          { status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { lte: now } },
          { status: 'PAST_DUE', currentPeriodEnd: { lte: addDays(now, -GRACE_DAYS) } },
        ],
      },
      select: { id: true, organizationId: true },
      take: 500,
    });
    let expired = 0;
    let pastDue = 0;
    for (const { id, organizationId } of due) {
      await this.db.$transaction(async (tx) => {
        await this.lockOrganization(tx, organizationId);
        const sub = await tx.subscription.findUnique({ where: { id } });
        if (!sub || !LIVE_STATUSES.includes(sub.status as (typeof LIVE_STATUSES)[number])) return; // changed meanwhile
        const ended = sub.currentPeriodEnd <= now;
        const graceOver = sub.currentPeriodEnd <= addDays(now, -GRACE_DAYS);
        if (sub.status === 'ACTIVE' && ended && !sub.cancelAtPeriodEnd) {
          await tx.subscription.update({ where: { id }, data: { status: 'PAST_DUE' } });
          await this.event(tx, id, 'PAYMENT_FAILED', { metadata: { reason: 'period_ended_unpaid' } });
          pastDue++;
        } else if ((sub.status === 'TRIALING' && ended) || (sub.status === 'ACTIVE' && ended) || (sub.status === 'PAST_DUE' && graceOver)) {
          await tx.subscription.update({ where: { id }, data: { status: 'EXPIRED', endedAt: now } });
          await this.event(tx, id, 'EXPIRED', { fromPlanId: sub.planId });
          await this.createFree(tx, organizationId, null);
          expired++;
        }
      });
    }
    return { checked: due.length, pastDue, expired };
  }

  // ── platform admin ──

  /** Comp / enterprise-by-agreement access without a payment. */
  async grant(req: AppRequest, organizationId: string, planCode: string, days: number, reason?: string) {
    const plan = await this.db.plan.findUnique({ where: { code: planCode } });
    if (!plan) throw new NotFoundException('Plan not found');
    const org = await this.db.organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { id: true } });
    if (!org) throw new NotFoundException('Organization not found');
    return this.db.$transaction(async (tx) => {
      await this.lockOrganization(tx, organizationId);
      const previous = await this.endLive(tx, organizationId, 'CANCELED', 'CANCELED', actorOf(req));
      const now = new Date();
      const sub = await tx.subscription.create({
        data: { organizationId, planId: plan.id, status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: addDays(now, days) },
      });
      await this.event(tx, sub.id, 'CREATED', { fromPlanId: previous?.planId, toPlanId: plan.id, actorUserId: actorOf(req), metadata: { granted: true, days, reason } });
      await this.audit.record(req, { action: 'subscription.granted', organizationId, entityType: 'subscription', entityId: sub.id, metadata: { plan: planCode, days, reason } }, tx);
      return sub;
    });
  }

  /** Immediate termination (fraud, chargeback). The organization drops to Free right away. */
  async terminate(req: AppRequest, subscriptionId: string) {
    const sub = await this.db.subscription.findUnique({ where: { id: subscriptionId }, include: { plan: true } });
    if (!sub || !LIVE_STATUSES.includes(sub.status as (typeof LIVE_STATUSES)[number])) throw new NotFoundException('Live subscription not found');
    if (sub.plan.code === 'FREE') throw new ConflictException('The Free plan cannot be terminated');
    await this.db.$transaction(async (tx) => {
      await this.lockOrganization(tx, sub.organizationId);
      await tx.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELED', canceledAt: new Date(), endedAt: new Date() } });
      await this.event(tx, sub.id, 'CANCELED', { fromPlanId: sub.planId, actorUserId: actorOf(req), metadata: { terminatedByAdmin: true } });
      await this.createFree(tx, sub.organizationId, actorOf(req));
      await this.audit.record(req, { action: 'subscription.terminated', organizationId: sub.organizationId, entityType: 'subscription', entityId: sub.id }, tx);
    });
  }
}
