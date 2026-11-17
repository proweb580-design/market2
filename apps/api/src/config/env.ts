import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    // No default on purpose: every environment must list its allowed origins explicitly.
    CORS_ORIGINS: z
      .string()
      .min(1)
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    SWAGGER_ENABLED: z.stringbool().default(true),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgresql:// connection string'),

    // Supabase Auth: the API verifies web access tokens itself (signature, issuer, audience, expiry).
    SUPABASE_URL: z.url().optional(),
    SUPABASE_JWT_AUDIENCE: z.string().default('authenticated'),
    /** Only for projects still on the legacy HS256 JWT secret; asymmetric keys are verified via JWKS. */
    SUPABASE_JWT_SECRET: z.string().min(16).optional(),

    THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
    /** Set true behind a reverse proxy (Render, Fly, Vercel) so client IPs come from X-Forwarded-For. */
    TRUST_PROXY: z.stringbool().default(false),
    INVITATION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),

    // Stripe (payments). Absent → billing works for Free/trials/admin grants, paid checkout answers 503.
    STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_(test|live)_/, 'must be a Stripe secret/restricted key').optional(),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),
    /** Where Stripe Checkout sends the buyer back (the web app). */
    PUBLIC_WEB_URL: z.url().default('http://localhost:3000'),
  })
  .superRefine((env, ctx) => {
    // Safety net: live keys only in production, so a dev machine can never move real money.
    if (env.STRIPE_SECRET_KEY && /_live_/.test(env.STRIPE_SECRET_KEY) && env.NODE_ENV !== 'production') {
      ctx.addIssue({ code: 'custom', path: ['STRIPE_SECRET_KEY'], message: 'live keys are only allowed with NODE_ENV=production' });
    }
    if (env.NODE_ENV !== 'test' && !env.SUPABASE_URL) {
      ctx.addIssue({ code: 'custom', path: ['SUPABASE_URL'], message: 'required outside tests' });
    }
  });

export type Env = z.infer<typeof envSchema>;
export const ENV = Symbol('ENV');

export function parseEnv(source: Record<string, string | undefined>): Env {
  // `KEY=` left blank in .env means "not set", not "set to an empty string".
  const result = envSchema.safeParse(Object.fromEntries(Object.entries(source).filter(([, v]) => v !== '')));
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
