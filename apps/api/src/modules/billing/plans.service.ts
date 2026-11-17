import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { createPlanSchema, updatePlanSchema } from '@repo/shared';
import { z } from 'zod';
import type { AppRequest } from '../../common/principal.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

type Features = z.infer<typeof createPlanSchema>['features'];

const planInclude = { features: { select: { featureKey: true, enabled: true, limitValue: true } } } as const;

/** API shape: features as a map, matching the request format. */
export function presentPlan<P extends { features: { featureKey: string; enabled: boolean; limitValue: number | null }[] }>(plan: P) {
  const { features, ...rest } = plan;
  return { ...rest, features: Object.fromEntries(features.map((f) => [f.featureKey, { enabled: f.enabled, limit: f.limitValue }])) };
}

const featureRows = (features: Features) =>
  Object.entries(features).map(([featureKey, v]) => ({ featureKey, enabled: v.enabled, limitValue: v.limit ?? null }));

@Injectable()
export class PlansService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Pricing page: active public plans only. */
  async listPublic() {
    const plans = await this.db.plan.findMany({ where: { isActive: true, isPublic: true }, orderBy: { sortOrder: 'asc' }, include: planInclude });
    return plans.map(presentPlan);
  }

  async listAll() {
    const plans = await this.db.plan.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { ...planInclude, _count: { select: { subscriptions: { where: { status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] } } } } } },
    });
    return plans.map(({ _count, ...p }) => ({ ...presentPlan(p), liveSubscriptions: _count.subscriptions }));
  }

  async create(req: AppRequest, dto: z.infer<typeof createPlanSchema>) {
    const { features, priceMinor, ...data } = dto;
    try {
      const plan = await this.db.$transaction(async (tx) => {
        const row = await tx.plan.create({
          data: { ...data, priceMinor: BigInt(priceMinor), features: { create: featureRows(features) } },
          include: planInclude,
        });
        await this.audit.record(req, { action: 'plan.created', entityType: 'plan', entityId: row.id, metadata: { code: row.code } }, tx);
        return row;
      });
      return presentPlan(plan);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('A plan with this code already exists');
      throw error;
    }
  }

  /** Price changes affect future payments only; running periods keep what was paid for. */
  async update(req: AppRequest, planId: string, dto: z.infer<typeof updatePlanSchema>) {
    const { features, priceMinor, ...data } = dto;
    const exists = await this.db.plan.findUnique({ where: { id: planId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Plan not found');
    const plan = await this.db.$transaction(async (tx) => {
      if (features) {
        await tx.planFeature.deleteMany({ where: { planId } });
        await tx.planFeature.createMany({ data: featureRows(features).map((f) => ({ ...f, planId })) });
      }
      const row = await tx.plan.update({
        where: { id: planId },
        data: { ...data, ...(priceMinor !== undefined ? { priceMinor: BigInt(priceMinor) } : {}) },
        include: planInclude,
      });
      await this.audit.record(req, { action: 'plan.updated', entityType: 'plan', entityId: planId, metadata: { fields: Object.keys(dto) } }, tx);
      return row;
    });
    return presentPlan(plan);
  }

  /** Plans with any subscription history are kept (deactivate them instead) — payments and history point at them. */
  async remove(req: AppRequest, planId: string) {
    const plan = await this.db.plan.findUnique({ where: { id: planId }, select: { code: true, _count: { select: { subscriptions: true } } } });
    if (!plan) throw new NotFoundException('Plan not found');
    if (plan.code === 'FREE') throw new ConflictException('The FREE plan is the fallback for every organization and cannot be deleted');
    if (plan._count.subscriptions > 0) {
      throw new ConflictException({ message: 'Plan has subscription history. Deactivate it instead.', details: { subscriptions: plan._count.subscriptions } });
    }
    await this.db.$transaction(async (tx) => {
      await tx.plan.delete({ where: { id: planId } });
      await this.audit.record(req, { action: 'plan.deleted', entityType: 'plan', entityId: planId, metadata: { code: plan.code } }, tx);
    });
  }

  async purchasable(code: string) {
    const plan = await this.db.plan.findUnique({ where: { code } });
    if (!plan || !plan.isActive || !plan.isPublic) throw new NotFoundException('Plan not available');
    return plan;
  }
}

export type PlanRow = Prisma.PlanGetPayload<object>;
