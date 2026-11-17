/**
 * Reference data: permissions, system roles, default plans. Safe to run repeatedly.
 * - permissions and system-role grants are synced to @repo/shared on every run;
 * - plans and plan features are only created when missing (admins edit them afterwards);
 * - SEED_SUPER_ADMIN_EMAIL (optional) grants SUPER_ADMIN to that email's user.
 * No demo/business data is created here.
 */
import { existsSync } from 'node:fs';
import { DEFAULT_PLANS, PERMISSIONS, PERMISSION_KEYS, SYSTEM_ROLE_DEFINITIONS } from '@repo/shared';
import { createPrismaClient } from '../src/infra/prisma/create-client.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('DIRECT_URL or DATABASE_URL must be set');

const db = createPrismaClient(url);

async function seedPermissions() {
  for (const key of PERMISSION_KEYS) {
    const { scope, description } = PERMISSIONS[key];
    await db.permission.upsert({ where: { key }, update: { scope, description }, create: { key, scope, description } });
  }
  return new Map((await db.permission.findMany()).map((p) => [p.key, p.id]));
}

async function seedRoles(permissionIds: Map<string, string>) {
  for (const def of SYSTEM_ROLE_DEFINITIONS) {
    const existing = await db.role.findFirst({ where: { key: def.key, organizationId: null } });
    const role = existing
      ? await db.role.update({ where: { id: existing.id }, data: { name: def.name, scope: def.scope, isSystem: true } })
      : await db.role.create({ data: { key: def.key, name: def.name, scope: def.scope, isSystem: true } });

    const wanted = def.permissions.map((k) => permissionIds.get(k)!);
    await db.$transaction([
      db.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: { notIn: wanted } } }),
      db.rolePermission.createMany({
        data: wanted.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      }),
    ]);
  }
}

async function seedPlans() {
  for (const [i, plan] of DEFAULT_PLANS.entries()) {
    const existing = await db.plan.findUnique({ where: { code: plan.code } });
    const { id } =
      existing ??
      (await db.plan.create({
        data: {
          code: plan.code,
          name: plan.name,
          priceMinor: BigInt(plan.priceMinor),
          currency: plan.currency,
          interval: plan.interval,
          trialDays: plan.trialDays,
          isPublic: plan.isPublic,
          sortOrder: i,
        },
      }));
    await db.planFeature.createMany({
      data: Object.entries(plan.features).map(([featureKey, value]) => ({
        planId: id,
        featureKey,
        enabled: value !== false,
        limitValue: typeof value === 'number' ? value : null,
      })),
      skipDuplicates: true,
    });
  }
}

async function seedSuperAdmin() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) return;
  const role = await db.role.findFirstOrThrow({ where: { key: 'SUPER_ADMIN', organizationId: null } });
  // The Supabase account is linked on first verified sign-in with this email (phase 5).
  const user = await db.user.upsert({ where: { email }, update: {}, create: { email } });
  await db.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });
  console.log(`SUPER_ADMIN granted to ${email}`);
}

try {
  const permissionIds = await seedPermissions();
  await seedRoles(permissionIds);
  await seedPlans();
  await seedSuperAdmin();
  const [permissions, roles, plans] = await Promise.all([db.permission.count(), db.role.count(), db.plan.count()]);
  console.log(`Seed done: ${permissions} permissions, ${roles} roles, ${plans} plans`);
} finally {
  await db.$disconnect();
}
