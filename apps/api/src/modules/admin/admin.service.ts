import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PaginationQuery, adminUsersQuerySchema, auditQuerySchema, blockUserSchema } from '@repo/shared';
import { z } from 'zod';
import { pageArgs, parseSort, toPage } from '../../common/pagination.js';
import type { AppRequest } from '../../common/principal.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AccessService } from '../access/access.service.js';
import { AuditService } from '../audit/audit.service.js';

type UsersQuery = z.infer<typeof adminUsersQuerySchema>;
type AuditQuery = z.infer<typeof auditQuerySchema>;

@Injectable()
export class AdminService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
  ) {}

  async stats() {
    const [users, blocked, organizations, suspended, apiKeys, subscriptions, payments] = await Promise.all([
      this.db.user.count({ where: { status: 'ACTIVE' } }),
      this.db.user.count({ where: { status: 'BLOCKED' } }),
      this.db.organization.count({ where: { deletedAt: null } }),
      this.db.organization.count({ where: { status: 'SUSPENDED' } }),
      this.db.apiKey.count({ where: { revokedAt: null } }),
      this.db.subscription.count({ where: { status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] } } }),
      this.db.payment.count({ where: { status: 'SUCCEEDED' } }),
    ]);
    return { users: { active: users, blocked }, organizations: { total: organizations, suspended }, apiKeys, subscriptions, successfulPayments: payments };
  }

  // ── users ──

  async listUsers(query: UsersQuery) {
    const where: Prisma.UserWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? { OR: [{ email: { contains: query.q.toLowerCase() } }, { profile: { displayName: { contains: query.q, mode: 'insensitive' } } }] }
        : {}),
    };
    const q = query as PaginationQuery;
    const [items, total] = await Promise.all([
      this.db.user.findMany({
        where,
        orderBy: parseSort(query.sort, ['createdAt', 'email', 'lastSeenAt'], { field: 'createdAt', dir: 'desc' }),
        ...pageArgs(q),
        select: { id: true, email: true, status: true, createdAt: true, lastSeenAt: true, profile: { select: { displayName: true } }, roles: { select: { role: { select: { key: true } } } } },
      }),
      this.db.user.count({ where }),
    ]);
    return toPage(items.map(({ roles, ...u }) => ({ ...u, platformRoles: roles.map((r) => r.role.key) })), total, q);
  }

  async getUser(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        status: true,
        blockedAt: true,
        blockedReason: true,
        createdAt: true,
        lastSeenAt: true,
        profile: true,
        telegramAccount: { select: { username: true, linkedAt: true } },
        roles: { select: { role: { select: { id: true, key: true, name: true } } } },
        memberships: { select: { organization: { select: { id: true, slug: true, name: true } }, role: { select: { key: true } } } },
        _count: { select: { sessions: { where: { revokedAt: null } } } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** A moderator may only block someone whose standing they could have granted themselves. */
  private async assertCanModerate(req: AppRequest, actorId: string, targetId: string) {
    if (actorId === targetId) throw new ConflictException('You cannot block yourself');
    const [actor, target] = await Promise.all([this.access.platformAccess(req, actorId), this.targetAccess(targetId)]);
    if (actor.isSuperAdmin) return;
    if (target.isSuperAdmin) throw new ForbiddenException('Only a super admin can moderate a super admin');
    const above = [...target.permissions].filter((k) => !actor.permissions.has(k));
    if (above.length) throw new ForbiddenException('You cannot moderate a user with more privileges than you');
  }

  private async targetAccess(userId: string) {
    const rows = await this.db.userRole.findMany({ where: { userId }, select: { role: { select: { key: true, permissions: { select: { permission: { select: { key: true } } } } } } } });
    return {
      isSuperAdmin: rows.some((r) => r.role.key === 'SUPER_ADMIN'),
      permissions: new Set(rows.flatMap((r) => r.role.permissions.map((p) => p.permission.key))),
    };
  }

  async blockUser(req: AppRequest, actorId: string, userId: string, dto: z.infer<typeof blockUserSchema>) {
    const user = await this.db.user.findFirst({ where: { id: userId, status: { not: 'DELETED' } }, select: { id: true, status: true } });
    if (!user) throw new NotFoundException('User not found');
    await this.assertCanModerate(req, actorId, userId);
    await this.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { status: 'BLOCKED', blockedAt: new Date(), blockedReason: dto.reason ?? null } });
      // Effective immediately: AuthGuard re-reads the status on every request, and live sessions are closed too.
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record(req, { action: 'user.blocked', entityType: 'user', entityId: userId, metadata: { reason: dto.reason } }, tx);
    });
  }

  async unblockUser(req: AppRequest, userId: string) {
    const { count } = await this.db.user.updateMany({ where: { id: userId, status: 'BLOCKED' }, data: { status: 'ACTIVE', blockedAt: null, blockedReason: null } });
    if (!count) throw new NotFoundException('Blocked user not found');
    await this.audit.record(req, { action: 'user.unblocked', entityType: 'user', entityId: userId });
  }

  // ── organizations ──

  async listOrganizations(query: PaginationQuery) {
    const where = { deletedAt: null };
    const [items, total] = await Promise.all([
      this.db.organization.findMany({
        where,
        orderBy: parseSort(query.sort, ['createdAt', 'name', 'slug'], { field: 'createdAt', dir: 'desc' }),
        ...pageArgs(query),
        select: { id: true, slug: true, name: true, status: true, createdAt: true, _count: { select: { members: true } } },
      }),
      this.db.organization.count({ where }),
    ]);
    return toPage(items, total, query);
  }

  async setOrganizationStatus(req: AppRequest, organizationId: string, status: 'ACTIVE' | 'SUSPENDED') {
    const { count } = await this.db.organization.updateMany({ where: { id: organizationId, deletedAt: null }, data: { status } });
    if (!count) throw new NotFoundException('Organization not found');
    await this.audit.record(req, { action: status === 'SUSPENDED' ? 'organization.suspended' : 'organization.activated', organizationId, entityType: 'organization', entityId: organizationId });
  }

  // ── audit, keys, settings ──

  async auditLogs(query: AuditQuery) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: { startsWith: query.action } } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    };
    const q = query as PaginationQuery;
    const [items, total] = await Promise.all([
      this.db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      this.db.auditLog.count({ where }),
    ]);
    return toPage(items, total, q);
  }

  async listApiKeys(query: PaginationQuery) {
    const [items, total] = await Promise.all([
      this.db.apiKey.findMany({
        orderBy: parseSort(query.sort, ['createdAt', 'lastUsedAt', 'name'], { field: 'createdAt', dir: 'desc' }),
        ...pageArgs(query),
        select: { id: true, name: true, prefix: true, scopes: true, organizationId: true, userId: true, lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true },
      }),
      this.db.apiKey.count(),
    ]);
    return toPage(items, total, query);
  }

  async revokeApiKey(req: AppRequest, keyId: string) {
    const { count } = await this.db.apiKey.updateMany({ where: { id: keyId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!count) throw new NotFoundException('API key not found');
    await this.audit.record(req, { action: 'api_key.revoked_by_admin', entityType: 'api_key', entityId: keyId });
  }

  listSettings() {
    return this.db.platformSetting.findMany({ orderBy: { key: 'asc' } });
  }

  async putSetting(req: AppRequest, actorId: string, key: string, value: unknown) {
    const row = await this.db.platformSetting.upsert({
      where: { key },
      update: { value: value as Prisma.InputJsonValue, updatedById: actorId },
      create: { key, value: value as Prisma.InputJsonValue, updatedById: actorId },
    });
    await this.audit.record(req, { action: 'setting.updated', entityType: 'setting', entityId: key });
    return row;
  }
}
