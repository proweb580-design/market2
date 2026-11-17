import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { decodeProtectedHeader, jwtVerify, SignJWT } from 'jose';
import { ENV, type Env } from '../../config/env.js';

/** Our own access tokens (Telegram sessions). The `kid` keeps them apart from Supabase tokens. */
export const PLATFORM_KID = 'platform-v1';
const ISSUER = 'platform-api';
const AUDIENCE = 'platform';
export const ACCESS_TTL_SEC = 15 * 60;

@Injectable()
export class PlatformTokenService {
  private readonly key: Uint8Array | null;

  constructor(@Inject(ENV) env: Env) {
    this.key = env.JWT_SECRET ? new TextEncoder().encode(env.JWT_SECRET) : null;
  }

  get enabled() {
    return this.key !== null;
  }

  static isPlatformToken(token: string) {
    try {
      return decodeProtectedHeader(token).kid === PLATFORM_KID;
    } catch {
      return false;
    }
  }

  async sign(userId: string, sessionId: string) {
    if (!this.key) throw new ServiceUnavailableException('JWT_SECRET is not configured');
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'HS256', kid: PLATFORM_KID })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TTL_SEC}s`)
      .sign(this.key);
  }

  /** Returns null for anything invalid; callers answer a generic 401. */
  async verify(token: string): Promise<{ userId: string; sessionId: string } | null> {
    if (!this.key) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'], requiredClaims: ['sub', 'exp', 'sid'] });
      return typeof payload.sid === 'string' && payload.sub ? { userId: payload.sub, sessionId: payload.sid } : null;
    } catch {
      return null;
    }
  }
}
