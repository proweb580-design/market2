import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// One project-wide .env in the repository root (apps/<app>/.env.local still wins). Already-set variables are never overridden.
const rootEnv = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ['@repo/ui'],
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
