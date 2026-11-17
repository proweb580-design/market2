import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createPrismaClient } from '../src/infra/prisma/create-client.js';

/**
 * Runs once before all DB test files: wipes the dedicated test database, applies migrations, seeds.
 * Only active when TEST_DATABASE_URL is set; refuses any database whose name does not end in "_test".
 */
export default async function setup() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  if (!new URL(url).pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL must name a *_test database');

  const db = createPrismaClient(url);
  await db.$executeRawUnsafe('DROP SCHEMA IF EXISTS "app" CASCADE');
  await db.$executeRawUnsafe('DROP TABLE IF EXISTS "public"."_prisma_migrations"');
  await db.$disconnect();

  const env = { ...process.env, DIRECT_URL: url, DATABASE_URL: url };
  execSync('pnpm exec prisma migrate deploy', { env, stdio: 'pipe' });
  execSync('pnpm exec tsx prisma/seed.ts', { env, stdio: 'pipe' });
}
