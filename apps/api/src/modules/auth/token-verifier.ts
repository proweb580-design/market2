import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import type { Env } from '../../config/env.js';

export const TOKEN_VERIFIER = Symbol('TOKEN_VERIFIER');

export interface SupabaseClaims {
  /** Supabase user id. */
  sub: string;
  email: string | null;
  emailVerified: boolean;
  /** `session_id` claim — identifies one device login. */
  sessionId?: string;
}

export interface TokenVerifier {
  verify(token: string): Promise<SupabaseClaims>;
}

export interface JwtVerifierOptions {
  issuer: string;
  audience: string;
  /** Key source for asymmetric tokens (Supabase JWKS). */
  jwks: JWTVerifyGetKey;
  /** Legacy HS256 secret; when absent HS* tokens are refused outright. */
  hsSecret?: string;
}

export class TokenError extends Error {}

/**
 * Verifies Supabase access tokens on the server — the frontend is never trusted.
 * Algorithms are pinned per key type, which blocks `alg: none` and HS/RS key-confusion attacks.
 */
export class JwtVerifier implements TokenVerifier {
  constructor(private readonly options: JwtVerifierOptions) {}

  async verify(token: string): Promise<SupabaseClaims> {
    let payload: JWTPayload;
    try {
      const { alg } = decodeProtectedHeader(token);
      const common = { issuer: this.options.issuer, audience: this.options.audience, requiredClaims: ['sub', 'exp'] };
      if (alg?.startsWith('HS')) {
        if (!this.options.hsSecret) throw new TokenError('symmetric tokens not accepted');
        ({ payload } = await jwtVerify(token, new TextEncoder().encode(this.options.hsSecret), { ...common, algorithms: ['HS256'] }));
      } else {
        ({ payload } = await jwtVerify(token, this.options.jwks, { ...common, algorithms: ['ES256', 'RS256', 'EdDSA'] }));
      }
    } catch {
      // One generic failure: callers must not learn whether signature, expiry or audience was wrong.
      throw new TokenError('invalid token');
    }

    const meta = (payload.user_metadata ?? {}) as { email_verified?: unknown };
    if (payload.is_anonymous === true) throw new TokenError('anonymous sessions are not accepted');
    if (typeof payload.sub !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.sub)) throw new TokenError('invalid subject');

    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' && payload.email ? payload.email.toLowerCase() : null,
      emailVerified: payload.email_verified === true || meta.email_verified === true,
      sessionId: typeof payload.session_id === 'string' ? payload.session_id : undefined,
    };
  }
}

export function createSupabaseVerifier(env: Env): TokenVerifier {
  if (!env.SUPABASE_URL) {
    // Tests inject their own verifier; this only happens in a misconfigured test environment.
    return { verify: () => Promise.reject(new TokenError('SUPABASE_URL is not configured')) };
  }
  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  return new JwtVerifier({
    issuer: `${base}/auth/v1`,
    audience: env.SUPABASE_JWT_AUDIENCE,
    jwks: createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`), { cooldownDuration: 30_000 }),
    hsSecret: env.SUPABASE_JWT_SECRET,
  });
}
