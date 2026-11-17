/**
 * Database integration tests: migrations, seed, and the constraints that protect tenants and money.
 * Needs TEST_DATABASE_URL pointing at a database whose name ends in "_test" (it is wiped and rebuilt).
 * Skipped when the variable is absent, so the unit suite runs anywhere.
 */
import 'reflect-metadata';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// Migrations + first seed run in test/global-setup.ts.
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PERMISSION_KEYS, PERMISSIONS } from '@repo/shared';
import { AppModule } from '../src/app.module.js';
import { ENV, parseEnv } from '../src/config/env.js';
import { setupApp } from '../src/setup.js';
import { createPrismaClient, type Db } from '../src/infra/prisma/create-client.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('database (TEST_DATABASE_URL)', () => {
  let db: Db;
  const run = (cmd: string) =>
    execSync(cmd, { env: { ...process.env, DIRECT_URL: url, DATABASE_URL: url }, stdio: 'pipe' }).toString();

  beforeAll(async () => {
    db = createPrismaClient(url!);
    run('pnpm exec tsx prisma/seed.ts'); // second seed run must be a no-op
  }, 180_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  // ── helpers ──
  const uniq = () => Math.random().toString(36).slice(2, 8);
  const systemRole = (key: string) => db.role.findFirstOrThrow({ where: { key, organizationId: null } });
  const newOrg = (slug = `org-${uniq()}`) => db.organization.create({ data: { slug, name: slug } });
  const newUser = () => db.user.create({ data: { email: `u-${uniq()}@example.com` } });

  describe('seed', () => {
    it('is idempotent and mirrors the shared catalogues', async () => {
      expect(await db.permission.count()).toBe(PERMISSION_KEYS.length);
      expect(await db.role.count({ where: { isSystem: true } })).toBe(9);
      expect(await db.plan.count()).toBe(5);
      const free = await db.plan.findUniqueOrThrow({ where: { code: 'FREE' }, include: { features: true } });
      expect(free.features.find((f) => f.featureKey === 'products.max')?.limitValue).toBe(10);
    });

    it('gives SUPER_ADMIN every platform permission and nothing org-scoped', async () => {
      const role = await db.role.findFirstOrThrow({
        where: { key: 'SUPER_ADMIN', organizationId: null },
        include: { permissions: { include: { permission: true } } },
      });
      const keys = role.permissions.map((p) => p.permission.key).sort();
      expect(keys).toEqual(PERMISSION_KEYS.filter((k) => PERMISSIONS[k].scope === 'PLATFORM').sort());
    });
  });

  describe('RBAC integrity', () => {
    it('rejects a second system role with the same key', async () => {
      await expect(db.role.create({ data: { key: 'SUPER_ADMIN', name: 'dup', scope: 'PLATFORM' } })).rejects.toThrow();
    });

    it('rejects assigning an organization role as a platform role', async () => {
      const user = await newUser();
      const owner = await systemRole('ORG_OWNER');
      await expect(db.userRole.create({ data: { userId: user.id, roleId: owner.id } })).rejects.toThrow(/not a platform role/);
    });

    it("rejects giving a member another organization's custom role (cross-tenant)", async () => {
      const [a, b] = [await newOrg(), await newOrg()];
      const user = await newUser();
      const foreign = await db.role.create({
        data: { key: 'PACKER', name: 'Packer', scope: 'ORGANIZATION', organizationId: b.id },
      });
      await expect(
        db.organizationMember.create({ data: { organizationId: a.id, userId: user.id, roleId: foreign.id } }),
      ).rejects.toThrow(/not available in organization/);
      // …but the same custom role works inside its own organization.
      await db.organizationMember.create({ data: { organizationId: b.id, userId: user.id, roleId: foreign.id } });
    });

    it('refuses to delete a role that is still assigned', async () => {
      const org = await newOrg();
      const user = await newUser();
      const role = await db.role.create({ data: { key: 'TEMP', name: 'Temp', scope: 'ORGANIZATION', organizationId: org.id } });
      await db.organizationMember.create({ data: { organizationId: org.id, userId: user.id, roleId: role.id } });
      await expect(db.role.delete({ where: { id: role.id } })).rejects.toThrow();
    });
  });

  describe('subscriptions', () => {
    it('allows one live subscription per organization but keeps history', async () => {
      const org = await newOrg();
      const plan = await db.plan.findUniqueOrThrow({ where: { code: 'PRO' } });
      const period = { currentPeriodStart: new Date('2026-01-01'), currentPeriodEnd: new Date('2026-02-01') };
      await db.subscription.create({ data: { organizationId: org.id, planId: plan.id, status: 'CANCELED', ...period } });
      await db.subscription.create({ data: { organizationId: org.id, planId: plan.id, status: 'ACTIVE', ...period } });
      await expect(
        db.subscription.create({ data: { organizationId: org.id, planId: plan.id, status: 'TRIALING', ...period } }),
      ).rejects.toThrow();
    });

    it('refuses to delete a plan with subscription history', async () => {
      const plan = await db.plan.findUniqueOrThrow({ where: { code: 'PRO' } });
      await expect(db.plan.delete({ where: { id: plan.id } })).rejects.toThrow();
    });
  });

  describe('money and data rules', () => {
    it('ties a payment to exactly the record its purpose names', async () => {
      const org = await newOrg();
      await expect(
        db.payment.create({
          data: { organizationId: org.id, purpose: 'SUBSCRIPTION', provider: 'sandbox', amountMinor: 1900n, currency: 'USD' },
        }),
      ).rejects.toThrow(/payments_purpose_target_chk/);
    });

    it('keeps order totals consistent and orders undeletable through their store', async () => {
      const org = await newOrg();
      const base = { organizationId: org.id, source: 'WEB' as const, currency: 'USD', subtotalMinor: 10_000n };
      await expect(db.order.create({ data: { ...base, number: 1001, totalMinor: 9_000n } })).rejects.toThrow(
        /orders_amounts_chk/,
      );
      await db.order.create({ data: { ...base, number: 1001, shippingMinor: 500n, totalMinor: 10_500n } });
      await expect(db.organization.delete({ where: { id: org.id } })).rejects.toThrow();
    });

    it('stores amounts and Telegram ids beyond 32 bits', async () => {
      const user = await newUser();
      const tg = await db.telegramAccount.create({ data: { userId: user.id, telegramId: 7_123_456_789n } });
      expect(tg.telegramId).toBe(7_123_456_789n);
      const plan = await db.plan.create({
        data: { code: `BIG-${uniq()}`, name: 'Big', priceMinor: 12_000_000_000n, currency: 'UZS', interval: 'YEAR' },
      });
      expect(plan.priceMinor).toBe(12_000_000_000n);
    });

    it('rejects mixed-case emails and malformed slugs', async () => {
      await expect(db.user.create({ data: { email: 'Mixed@Example.com' } })).rejects.toThrow(/users_email_lower_chk/);
      await expect(newOrg('Bad Slug!')).rejects.toThrow(/organizations_slug_format_chk/);
    });

    it('cascades tenant-owned data when an organization without orders is deleted', async () => {
      const org = await newOrg();
      const product = await db.product.create({ data: { organizationId: org.id, slug: 'tee', title: 'Tee' } });
      await db.productVariant.create({ data: { organizationId: org.id, productId: product.id, sku: 'T-1', priceMinor: 5000n } });
      await db.organization.delete({ where: { id: org.id } });
      expect(await db.product.count({ where: { organizationId: org.id } })).toBe(0);
      expect(await db.productVariant.count({ where: { organizationId: org.id } })).toBe(0);
    });
  });

  describe('API readiness', () => {
    let app: INestApplication;
    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(ENV)
        .useValue(parseEnv({ NODE_ENV: 'test', CORS_ORIGINS: 'http://localhost:3000', DATABASE_URL: url }))
        .compile();
      app = moduleRef.createNestApplication();
      setupApp(app);
      await app.init();
    });
    afterAll(() => app?.close());

    it('GET /api/v1/health/ready is 200 when the database answers', async () => {
      await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200, { status: 'ok', database: 'up' });
    });
  });
});
