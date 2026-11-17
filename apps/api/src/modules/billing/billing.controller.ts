import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, type RawBodyRequest } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiHeader, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  checkoutSchema,
  createPlanSchema,
  grantSubscriptionSchema,
  paginationQuerySchema,
  paymentsQuerySchema,
  refundSchema,
  startTrialSchema,
  subscriptionsQuerySchema,
  updatePlanSchema,
} from '@repo/shared';
import { z } from 'zod';
import { CurrentTenant, Public, Req, RequirePermissions, UserOnly } from '../../common/decorators.js';
import { pageArgs, parseSort, toPage } from '../../common/pagination.js';
import type { AppRequest, Tenant } from '../../common/principal.js';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../../common/zod.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { EntitlementsService, type LimitKey } from './entitlements.service.js';
import { PaymentsService } from './payments/payments.service.js';
import { PlansService } from './plans.service.js';
import { SubscriptionsService } from './subscriptions.service.js';
import { PLAN_FEATURES } from '@repo/shared';

type Q<S extends z.ZodType> = z.infer<S>;

/** Public pricing data. */
@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  @Public()
  list() {
    return this.plans.listPublic();
  }
}

/** A brand's own billing: plan, usage, trial, checkout, cancel/resume, history, payments. */
@ApiTags('billing')
@ApiBearerAuth()
@Controller('organizations/:orgId')
export class OrganizationBillingController {
  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly payments: PaymentsService,
    private readonly plans: PlansService,
  ) {}

  @Get('subscription')
  @RequirePermissions('org.billing.read')
  async current(@CurrentTenant() t: Tenant) {
    const ent = await this.entitlements.forOrganization(t.organizationId);
    const limits = Object.keys(PLAN_FEATURES).filter((k) => PLAN_FEATURES[k as keyof typeof PLAN_FEATURES].kind === 'limit') as LimitKey[];
    const usage = Object.fromEntries(await Promise.all(limits.map(async (k) => [k, await this.entitlements.usage(t.organizationId, k)] as const)));
    return { ...ent, usage };
  }

  @Get('subscription/history')
  @RequirePermissions('org.billing.read')
  history(@CurrentTenant() t: Tenant) {
    return this.subscriptions.history(t.organizationId);
  }

  @Post('subscription/trial')
  @UserOnly()
  @RequirePermissions('org.billing.manage')
  @ApiZodBody(startTrialSchema)
  async trial(@Req() req: AppRequest, @CurrentTenant() t: Tenant, @Body(new ZodPipe(startTrialSchema)) body: Q<typeof startTrialSchema>) {
    return this.subscriptions.startTrial(req, t.organizationId, await this.plans.purchasable(body.planCode));
  }

  /** Pay for a plan period: upgrade, switch, or renew (same plan extends the period). Returns the hosted payment page URL. */
  @Post('subscription/checkout')
  @UserOnly()
  @RequirePermissions('org.billing.manage')
  @ApiZodBody(checkoutSchema)
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Retry-safe key; the same key returns the first response' })
  checkout(@Req() req: AppRequest, @CurrentTenant() t: Tenant, @Body(new ZodPipe(checkoutSchema)) body: Q<typeof checkoutSchema>, @Headers('idempotency-key') key?: string) {
    return this.payments.checkout(req, t.organizationId, body.planCode, key);
  }

  @Post('subscription/cancel')
  @UserOnly()
  @RequirePermissions('org.billing.manage')
  cancel(@Req() req: AppRequest, @CurrentTenant() t: Tenant) {
    return this.subscriptions.setCancelAtPeriodEnd(req, t.organizationId, true);
  }

  @Post('subscription/resume')
  @UserOnly()
  @RequirePermissions('org.billing.manage')
  resume(@Req() req: AppRequest, @CurrentTenant() t: Tenant) {
    return this.subscriptions.setCancelAtPeriodEnd(req, t.organizationId, false);
  }

  @Get('payments')
  @RequirePermissions('org.billing.read')
  @ApiZodQuery(paymentsQuerySchema)
  paymentList(@CurrentTenant() t: Tenant, @Query(new ZodPipe(paymentsQuerySchema)) q: Q<typeof paymentsQuerySchema>) {
    return this.payments.list(q, t.organizationId);
  }

  @Get('payments/:paymentId')
  @RequirePermissions('org.billing.read')
  payment(@CurrentTenant() t: Tenant, @Param('paymentId', ParseUUIDPipe) id: string) {
    return this.payments.getForOrganization(t.organizationId, id);
  }

  /** Called by the billing page after returning from checkout: confirms with the provider without waiting for the webhook. */
  @Post('payments/:paymentId/sync')
  @HttpCode(200)
  @RequirePermissions('org.billing.read')
  sync(@CurrentTenant() t: Tenant, @Param('paymentId', ParseUUIDPipe) id: string) {
    return this.payments.sync(t.organizationId, id);
  }

  @Get('transactions')
  @RequirePermissions('org.billing.read')
  @ApiZodQuery(paginationQuerySchema)
  transactions(@CurrentTenant() t: Tenant, @Query(new ZodPipe(paginationQuerySchema)) q: Q<typeof paginationQuerySchema>) {
    return this.payments.transactions(t.organizationId, q);
  }
}

/** Provider → platform. Public, but every request must carry a valid signature over the raw body. */
@ApiTags('payments')
@Controller('payments/webhooks')
export class WebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('stripe')
  @HttpCode(200)
  @Public()
  @SkipThrottle() // authenticity comes from the signature; throttling would drop legitimate provider bursts
  @ApiExcludeEndpoint()
  stripe(@Req() req: RawBodyRequest<AppRequest>, @Headers('stripe-signature') signature?: string) {
    return this.payments.handleWebhook(req.rawBody, signature);
  }
}

/** Platform back office for plans, subscriptions and payments. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminBillingController {
  constructor(
    private readonly db: PrismaService,
    private readonly plans: PlansService,
    private readonly subscriptions: SubscriptionsService,
    private readonly payments: PaymentsService,
  ) {}

  @Get('plans')
  @RequirePermissions('platform.plans.manage')
  plansList() {
    return this.plans.listAll();
  }

  @Post('plans')
  @RequirePermissions('platform.plans.manage')
  @ApiZodBody(createPlanSchema)
  createPlan(@Req() req: AppRequest, @Body(new ZodPipe(createPlanSchema)) body: Q<typeof createPlanSchema>) {
    return this.plans.create(req, body);
  }

  @Patch('plans/:planId')
  @RequirePermissions('platform.plans.manage')
  @ApiZodBody(updatePlanSchema)
  updatePlan(@Req() req: AppRequest, @Param('planId', ParseUUIDPipe) id: string, @Body(new ZodPipe(updatePlanSchema)) body: Q<typeof updatePlanSchema>) {
    return this.plans.update(req, id, body);
  }

  @Delete('plans/:planId')
  @HttpCode(204)
  @RequirePermissions('platform.plans.manage')
  deletePlan(@Req() req: AppRequest, @Param('planId', ParseUUIDPipe) id: string) {
    return this.plans.remove(req, id);
  }

  @Get('subscriptions')
  @RequirePermissions('platform.subscriptions.read')
  @ApiZodQuery(subscriptionsQuerySchema)
  async subscriptionsList(@Query(new ZodPipe(subscriptionsQuerySchema)) q: Q<typeof subscriptionsQuerySchema>) {
    const where = { ...(q.status ? { status: q.status } : {}), ...(q.organizationId ? { organizationId: q.organizationId } : {}) };
    const [items, total] = await Promise.all([
      this.db.subscription.findMany({
        where,
        orderBy: parseSort(q.sort, ['createdAt', 'currentPeriodEnd'], { field: 'createdAt', dir: 'desc' }),
        ...pageArgs(q),
        include: { plan: { select: { code: true, name: true } }, organization: { select: { slug: true, name: true } } },
      }),
      this.db.subscription.count({ where }),
    ]);
    return toPage(items, total, q);
  }

  @Post('organizations/:organizationId/subscription')
  @RequirePermissions('platform.subscriptions.manage')
  @ApiZodBody(grantSubscriptionSchema)
  grant(@Req() req: AppRequest, @Param('organizationId', ParseUUIDPipe) orgId: string, @Body(new ZodPipe(grantSubscriptionSchema)) body: Q<typeof grantSubscriptionSchema>) {
    return this.subscriptions.grant(req, orgId, body.planCode, body.days, body.reason);
  }

  @Post('subscriptions/:subscriptionId/terminate')
  @HttpCode(204)
  @RequirePermissions('platform.subscriptions.manage')
  terminate(@Req() req: AppRequest, @Param('subscriptionId', ParseUUIDPipe) id: string) {
    return this.subscriptions.terminate(req, id);
  }

  /** Runs the expiry/past-due job now (it also runs on a timer). */
  @Post('subscriptions/run-lifecycle')
  @HttpCode(200)
  @RequirePermissions('platform.subscriptions.manage')
  runLifecycle() {
    return this.subscriptions.runLifecycle();
  }

  @Get('payments')
  @RequirePermissions('platform.payments.read')
  @ApiZodQuery(paymentsQuerySchema)
  paymentList(@Query(new ZodPipe(paymentsQuerySchema)) q: Q<typeof paymentsQuerySchema>) {
    return this.payments.list(q);
  }

  @Post('payments/:paymentId/refund')
  @UserOnly()
  @RequirePermissions('platform.payments.refund')
  @ApiZodBody(refundSchema)
  refund(@Req() req: AppRequest, @Param('paymentId', ParseUUIDPipe) id: string, @Body(new ZodPipe(refundSchema)) body: Q<typeof refundSchema>) {
    return this.payments.refund(req, id, body.amountMinor, body.reason);
  }
}
