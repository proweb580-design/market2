import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Local development convenience: loads `apps/api/.env` (optional per-app override) and then the single
 * project-wide `.env` in the repository root. Variables already set in the process — i.e. real
 * environment variables in staging/production, or earlier files — are never overridden.
 */
export function loadEnv() {
  for (const file of ['.env', '../../.env']) {
    const path = resolve(process.cwd(), file);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}
