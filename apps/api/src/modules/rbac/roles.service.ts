import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PERMISSIONS, SYSTEM_ROLE_DEFINITIONS } from '@repo/shared';
import { z } from 'zod';
import { createRoleSchema, updateRoleSchema } from '@repo/shared';
import type { AppRequest } from '../../common/principal.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

/** Where a role operation happens: the platform (organizationId null) or one organization. */
export interface RoleScope {
  organizationId: string | null;
}
export interface RoleActor {
  /** Permissions the caller may hand out — a caller can never grant more than they hold. */
  grantable: ReadonlySet<string>;
  isSuperAdmin: boolean;
}

const SYSTEM_KEYS: Set<string> = new Set(SYSTEM_ROLE_DEFINITIONS.map((r) => r.key));
const roleSelect = {
  id: true,
  key: true,
  name: true,
  description: true,
  scope: true,
  isSystem: true,
  organizationId: true,
  permissions: { select: { permission: { select: { key: true } } } },
} as const;

const shape = <R extends { permissions: { permission: { key: string } }[] }>(r: R) => ({
  ...r,
  permissions: r.permissions.map((p) => p.permission.key).sort(),
});

@Injectable()
export class RolesService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private scopeName = (s: RoleScope) => (s.organizationId ? 'ORGANIZATION' : 'PLATFORM') as 'ORGANIZATION' | 'PLATFORM';

  /** Roles visible in a scope: platform → platform-level roles; organization → system org roles + that org's custom roles. */
  async list(scope: RoleScope) {
    const rows = await this.db.role.findMany({
      where: scope.organizationId
        ? { OR: [{ organizationId: scope.organizationId }, { organizationId: null, scope: 'ORGANIZATION' }] }
        : { organizationId: null },
      select: roleSelect,
      orderBy: [{ isSystem: 'desc' }, { key: 'asc' }],
    });
    return rows.map(shape);
  }

  private assertPermissions(scope: RoleScope, actor: RoleActor, keys: readonly string[]) {
    const expected = this.scopeName(scope);
    for (const key of keys) {
      if (PERMISSIONS[key as keyof typeof PERMISSIONS]?.scope !== expected) {
        throw new UnprocessableEntityException(`Permission "${key}" cannot be used in ${expected.toLowerCase()} roles`);
      }
      if (!actor.grantable.has(key)) throw new ForbiddenException(`You cannot grant a permission you do not hold: ${key}`);
    }
  }

  async create(req: AppRequest, scope: RoleScope, actor: RoleActor, dto: z.infer<typeof createRoleSchema>) {
    if (SYSTEM_KEYS.has(dto.key) || /^(ORG|PLATFORM|SYSTEM)_/.test(dto.key)) {
      throw new UnprocessableEntityException('This key is reserved for system roles');
    }
    const permissions = [...new Set(dto.permissions)];
    this.assertPermissions(scope, actor, permissions);

    const role = await this.db.$transaction(async (tx) => {
      const ids = await tx.permission.findMany({ where: { key: { in: permissions } }, select: { id: true } });
      const created = await tx.role.create({
        data: {
          key: dto.key,
          name: dto.name,
          description: dto.description,
          scope: this.scopeName(scope),
          organizationId: scope.organizationId,
          isSystem: false,
          permissions: { create: ids.map((p) => ({ permissionId: p.id })) },
        },
        select: roleSelect,
      });
      await this.audit.record(req, { action: 'role.created', organizationId: scope.organizationId, entityType: 'role', entityId: created.id, metadata: { key: dto.key, permissions } }, tx);
      return created;
    });
    return shape(role);
  }

  /** Looks a role up *inside the scope* — an id from another organization is simply "not found". */
  private async inScope(scope: RoleScope, roleId: string) {
    const role = await this.db.role.findFirst({
      where: { id: roleId, organizationId: scope.organizationId, scope: this.scopeName(scope) },
      select: roleSelect,
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new ConflictException('System roles cannot be changed');
    return role;
  }

  async update(req: AppRequest, scope: RoleScope, actor: RoleActor, roleId: string, dto: z.infer<typeof updateRoleSchema>) {
    const role = await this.inScope(scope, roleId);
    const { permissions: wanted, ...fields } = dto;

    if (wanted) {
      const next = [...new Set(wanted)];
      const current = new Set(role.permissions.map((p) => p.permission.key));
      // Only *newly added* permissions are checked against the caller's own — removing is always allowed.
      this.assertPermissions(scope, actor, next.filter((k) => !current.has(k)));
      for (const k of next) if (PERMISSIONS[k as keyof typeof PERMISSIONS]?.scope !== this.scopeName(scope)) throw new UnprocessableEntityException(`Invalid permission: ${k}`);
    }

    const updated = await this.db.$transaction(async (tx) => {
      if (wanted) {
        const next = [...new Set(wanted)];
        const ids = await tx.permission.findMany({ where: { key: { in: next } }, select: { id: true } });
        await tx.rolePermission.deleteMany({ where: { roleId } });
        await tx.rolePermission.createMany({ data: ids.map((p) => ({ roleId, permissionId: p.id })) });
      }
      const row = await tx.role.update({ where: { id: roleId }, data: fields, select: roleSelect });
      await this.audit.record(req, { action: 'role.updated', organizationId: scope.organizationId, entityType: 'role', entityId: roleId, metadata: { fields: Object.keys(dto) } }, tx);
      return row;
    });
    return shape(updated);
  }

  async remove(req: AppRequest, scope: RoleScope, roleId: string) {
    await this.inScope(scope, roleId);
    const [members, invitations, platformUsers] = await Promise.all([
      this.db.organizationMember.count({ where: { roleId } }),
      // Only invitations that could still be accepted block deletion; the rest is history.
      this.db.invitation.count({ where: { roleId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
      this.db.userRole.count({ where: { roleId } }),
    ]);
    if (members + invitations + platformUsers > 0) {
      throw new ConflictException({
        message: 'Role is still assigned. Reassign its holders first.',
        details: { members, pendingInvitations: invitations, platformUsers },
      });
    }
    await this.db.$transaction(async (tx) => {
      await tx.invitation.deleteMany({ where: { roleId } }); // accepted / revoked / expired rows only reference the role as history
      await tx.role.delete({ where: { id: roleId } });
      await this.audit.record(req, { action: 'role.deleted', organizationId: scope.organizationId, entityType: 'role', entityId: roleId }, tx);
    });
  }

  // ── platform role assignment ──

  private async platformRole(roleId: string) {
    const role = await this.db.role.findFirst({ where: { id: roleId, organizationId: null, scope: 'PLATFORM' }, select: roleSelect });
    if (!role) throw new NotFoundException('Platform role not found');
    return role;
  }

  async assignPlatformRole(req: AppRequest, actor: RoleActor, userId: string, roleId: string) {
    const role = await this.platformRole(roleId);
    if (role.key === 'SUPER_ADMIN' && !actor.isSuperAdmin) throw new ForbiddenException('Only a super admin can grant SUPER_ADMIN');
    if (!actor.isSuperAdmin) {
      const missing = role.permissions.map((p) => p.permission.key).filter((k) => !actor.grantable.has(k));
      if (missing.length) throw new ForbiddenException('You cannot assign a role with permissions you do not hold');
    }
    const user = await this.db.user.findFirst({ where: { id: userId, status: { not: 'DELETED' } }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');

    await this.db.$transaction(async (tx) => {
      await tx.userRole.upsert({
        where: { userId_roleId: { userId, roleId } },
        update: {},
        create: { userId, roleId, assignedById: req.principal?.kind === 'user' ? req.principal.user.id : null },
      });
      await this.audit.record(req, { action: 'role.assigned', entityType: 'user', entityId: userId, metadata: { roleKey: role.key } }, tx);
    });
  }

  async unassignPlatformRole(req: AppRequest, actor: RoleActor, userId: string, roleId: string) {
    const role = await this.platformRole(roleId);
    if (role.key === 'SUPER_ADMIN') {
      if (!actor.isSuperAdmin) throw new ForbiddenException('Only a super admin can revoke SUPER_ADMIN');
      const holders = await this.db.userRole.count({ where: { roleId, user: { status: 'ACTIVE' } } });
      if (holders <= 1) throw new ConflictException('Cannot remove the last SUPER_ADMIN');
    }
    const { count } = await this.db.userRole.deleteMany({ where: { userId, roleId } });
    if (!count) throw new NotFoundException('Assignment not found');
    await this.audit.record(req, { action: 'role.unassigned', entityType: 'user', entityId: userId, metadata: { roleKey: role.key } });
  }
}
