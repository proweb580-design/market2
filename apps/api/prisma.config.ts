import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

// Same files the API reads (apps/api/.env, then the root .env); deployed environments inject real env vars.
for (const file of ['.env', '../../.env']) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) process.loadEnvFile(path);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection; on Supabase that is the 5432 "session" URL.
    // process.env (not env()) so `prisma generate` works in CI builds without database credentials.
    url: process.env.DIRECT_URL,
  },
});
