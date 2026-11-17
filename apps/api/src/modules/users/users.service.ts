import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { paginationQuerySchema, type PaginationQuery, type SettingsUpdate } from '@repo/shared';
import { z } from 'zod';
import { pageArgs, toPage } from '../../common/pagination.js';
import type { AppRequest } from '../../common/principal.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

export const activityQuerySchema = paginationQuerySchema.omit({ sort: true });

@Injectable()
export class UsersService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  getSettings(userId: string) {
    return this.db.userSettings.findUniqueOrThrow({ where: { userId } });
  }

  async updateSettings(req: AppRequest, userId: string, data: SettingsUpdate) {
    const settings = await this.db.userSettings.update({
      where: { userId },
      data: { ...data, notifications: data.notifications as Prisma.InputJsonValue | undefined },
    });
    await this.audit.record(req, { action: 'settings.updated', entityType: 'user', entityId: userId, metadata: { fields: Object.keys(data) } });
    return settings;
  }

  async listSessions(userId: string, currentSessionId?: string) {
    const rows = await this.db.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, kind: true, userAgent: true, ip: true, createdAt: true, lastSeenAt: true, expiresAt: true },
    });
    return rows.map((s) => ({ ...s, current: s.id === currentSessionId }));
  }

  async revokeSession(req: AppRequest, userId: string, sessionId: string) {
    // `userId` in the filter is the IDOR guard: someone else's session id simply matches nothing.
    const { count } = await this.db.session.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!count) throw new NotFoundException('Session not found');
    await this.audit.record(req, { action: 'session.revoked', entityType: 'session', entityId: sessionId });
  }

  async activity(userId: string, query: z.infer<typeof activityQuerySchema>) {
    const where = { actorUserId: userId };
    const [items, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query as PaginationQuery),
        select: { id: true, action: true, entityType: true, entityId: true, organizationId: true, ip: true, createdAt: true },
      }),
      this.db.auditLog.count({ where }),
    ]);
    return toPage(items, total, query as PaginationQuery);
  }

  /**
   * Account deletion = anonymise + close, not row removal: orders and audit rows must keep pointing at a user id.
   * The Supabase auth record is removed by the frontend flow / admin tooling (needs the service-role key, not held here);
   * until then a sign-in with it is refused because the platform user is DELETED.
   */
  async deleteAccount(req: AppRequest, userId: string) {
    const soleOwnerOf = await this.db.organizationMember.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        role: { key: 'ORG_OWNER', organizationId: null },
        organization: { deletedAt: null, members: { none: { userId: { not: userId }, status: 'ACTIVE', role: { key: 'ORG_OWNER' } } } },
      },
      select: { organization: { select: { slug: true } } },
    });
    if (soleOwnerOf.length) {
      throw new ConflictException({
        message: 'You are the only owner of an organization. Transfer ownership or delete the organization first.',
        details: { organizations: soleOwnerOf.map((m) => m.organization.slug) },
      });
    }

    await this.db.$transaction(async (tx) => {
      await this.audit.record(req, { action: 'user.deleted_self', entityType: 'user', entityId: userId }, tx);
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.apiKey.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.organizationMember.deleteMany({ where: { userId } });
      await tx.cart.deleteMany({ where: { userId } });
      await tx.wishlistItem.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.telegramAccount.deleteMany({ where: { userId } });
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.profile.deleteMany({ where: { userId } });
      await tx.userSettings.deleteMany({ where: { userId } });
      await tx.user.update({ where: { id: userId }, data: { status: 'DELETED', deletedAt: new Date(), email: null } });
    });
  }
}
