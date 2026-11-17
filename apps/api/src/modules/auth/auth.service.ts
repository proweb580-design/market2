import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { ApiKeyInfo, AuthUser } from '../../common/principal.js';
import { safeEqualHex, sha256 } from '../../common/crypto.js';
import type { SupabaseClaims } from './token-verifier.js';

const SEEN_EVERY_MS = 5 * 60_000;
const USER_SELECT = { id: true, email: true, status: true, lastSeenAt: true } as const;

@Injectable()
export class AuthService {
  constructor(private readonly db: PrismaService) {}

  /**
   * Maps verified Supabase claims onto a platform user.
   * First sight creates the user (profile + settings); an unlinked user with the same *verified* email
   * (e.g. the seeded SUPER_ADMIN) is linked instead of duplicated.
   */
  async resolveSupabaseUser(claims: SupabaseClaims): Promise<{ user: AuthUser; sessionId?: string }> {
    let user = await this.db.user.findUnique({ where: { supabaseId: claims.sub }, select: USER_SELECT });

    if (!user) {
      const email = claims.emailVerified ? claims.email : null; // unverified emails are never stored or linked
      try {
        const existing = email ? await this.db.user.findUnique({ where: { email }, select: { id: true, supabaseId: true } }) : null;
        if (existing?.supabaseId) throw new ConflictException('This email belongs to another account');
        user = existing
          ? await this.db.user.update({ where: { id: existing.id }, data: { supabaseId: claims.sub }, select: USER_SELECT })
          : await this.db.user.create({
              data: {
                supabaseId: claims.sub,
                email,
                profile: { create: {} },
                settings: { create: {} },
              },
              select: USER_SELECT,
            });
      } catch (error) {
        // Two first requests racing: the loser re-reads the winner's row.
        if ((error as { code?: string }).code !== 'P2002') throw error;
        user = await this.db.user.findUnique({ where: { supabaseId: claims.sub }, select: USER_SELECT });
        if (!user) throw error;
      }
    }

    if (user.status === 'BLOCKED') throw new ForbiddenException('Account is blocked');
    if (user.status === 'DELETED') throw new ForbiddenException('Account was deleted');

    let sessionId: string | undefined;
    if (claims.sessionId) {
      const session = await this.db.session.upsert({
        where: { supabaseSessionId: claims.sessionId },
        update: {},
        create: { userId: user.id, kind: 'WEB', supabaseSessionId: claims.sessionId },
        select: { id: true, userId: true, revokedAt: true, lastSeenAt: true },
      });
      // The session id must belong to this user, and revocation ("sign out on that device") is honoured
      // even while the JWT itself has not expired yet.
      if (session.userId !== user.id || session.revokedAt) throw new UnauthorizedException('Session was revoked');
      sessionId = session.id;
      if (Date.now() - session.lastSeenAt.getTime() > SEEN_EVERY_MS) {
        await this.db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
      }
    }

    if (!user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > SEEN_EVERY_MS) {
      await this.db.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
    }
    return { user: { id: user.id, email: user.email, status: user.status }, sessionId };
  }

  /** Our own (Telegram) access token → user. The session row is the authority: revoked/expired sessions stop at once. */
  async resolvePlatformSession(userId: string, sessionId: string): Promise<{ user: AuthUser; sessionId: string }> {
    const session = await this.db.session.findUnique({
      where: { id: sessionId },
      select: { userId: true, revokedAt: true, expiresAt: true, user: { select: { id: true, email: true, status: true } } },
    });
    if (!session || session.userId !== userId || session.revokedAt || (session.expiresAt && session.expiresAt <= new Date())) {
      throw new UnauthorizedException('Session was revoked');
    }
    if (session.user.status === 'BLOCKED') throw new ForbiddenException('Account is blocked');
    if (session.user.status === 'DELETED') throw new ForbiddenException('Account was deleted');
    return { user: session.user, sessionId };
  }

  /** Looks a key up by its public prefix, then compares SHA-256 digests in constant time. */
  async resolveApiKey(raw: string): Promise<{ key: ApiKeyInfo & { rateLimitPerMinute: number }; user?: AuthUser }> {
    const invalid = new UnauthorizedException('Invalid API key');
    const m = /^pk_([A-Za-z0-9]{8})\.([A-Za-z0-9_-]{32,64})$/.exec(raw);
    if (!m) throw invalid;

    const key = await this.db.apiKey.findUnique({
      where: { prefix: m[1] },
      include: {
        organization: { select: { status: true, deletedAt: true } },
        user: { select: { id: true, email: true, status: true } },
      },
    });
    if (!key || !safeEqualHex(key.keyHash, sha256(raw))) throw invalid;
    if (key.revokedAt || (key.expiresAt && key.expiresAt <= new Date())) throw invalid;
    if (key.organization && (key.organization.deletedAt || key.organization.status !== 'ACTIVE')) {
      throw new ForbiddenException('Organization is not active');
    }
    if (key.user && key.user.status !== 'ACTIVE') throw new ForbiddenException('Key owner is not active');

    if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
      await this.db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
    }
    return {
      key: {
        id: key.id,
        organizationId: key.organizationId,
        userId: key.userId,
        scopes: key.scopes,
        rateLimitPerMinute: key.rateLimitPerMinute,
      },
      user: key.user ?? undefined,
    };
  }
}
