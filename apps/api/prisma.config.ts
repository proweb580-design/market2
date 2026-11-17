import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Same .env the API reads; deployed environments inject real env vars.
if (existsSync('.env')) process.loadEnvFile('.env');

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
