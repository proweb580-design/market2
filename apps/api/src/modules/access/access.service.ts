import { Injectable } from '@nestjs/common';
import { PERMISSIONS, type PermissionKey } from '@repo/shared';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { AppRequest, PlatformAccess, Tenant } from '../../common/principal.js';

export const isOrgPermission = (key: string) => PERMISSIONS[key as PermissionKey]?.scope === 'ORGANIZATION';
const ALL_ORG_PERMISSIONS = Object.entries(PERMISSIONS)
  .filter(([, v]) => v.scope === 'ORGANIZATION')
  .map(([k]) => k);

@Injectable()
export class AccessService {
  constructor(private readonly db: PrismaService) {}

  /** Platform roles → permissions of a user. Memoised on the request so guards and handlers share one query. */
  async platformAccess(req: AppRequest, userId: string): Promise<PlatformAccess> {
    if (req.platformAccess) return req.platformAccess;
    const rows = await this.db.userRole.findMany({
      where: { userId },
      select: { role: { select: { key: true, permissions: { select: { permission: { select: { key: true } } } } } } },
    });
    const roleKeys = rows.map((r) => r.role.key);
    const permissions = new Set(rows.flatMap((r) => r.role.permissions.map((p) => p.permission.key)));
    return (req.platformAccess = { permissions, roleKeys, isSuperAdmin: roleKeys.includes('SUPER_ADMIN') });
  }

  /**
   * Resolves the caller's standing inside one organization, or null.
   * "Not found" and "not yours" are indistinguishable to the caller on purpose (no ID probing).
   */
  async tenantFor(req: AppRequest, userId: string, organizationId: string): Promise<Tenant | null> {
    const org = await this.db.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!org) return null;

    const platform = await this.platformAccess(req, userId);
    const member = await this.db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: {
        id: true,
        status: true,
        role: { select: { key: true, isSystem: true, permissions: { select: { permission: { select: { key: true } } } } } },
      },
    });

    if (member && member.status === 'ACTIVE') {
      return {
        organizationId,
        memberId: member.id,
        // Only system roles expose their bare key; a custom role can never impersonate "ORG_OWNER".
        roleKey: member.role.isSystem ? member.role.key : `custom:${member.role.key}`,
        permissions: new Set(member.role.permissions.map((p) => p.permission.key)),
        viaSuperAdmin: false,
      };
    }
    if (platform.isSuperAdmin) {
      return { organizationId, memberId: null, roleKey: null, permissions: new Set(ALL_ORG_PERMISSIONS), viaSuperAdmin: true };
    }
    return null;
  }

  async organizationStatus(organizationId: string) {
    return (await this.db.organization.findUnique({ where: { id: organizationId }, select: { status: true } }))?.status;
  }

  /** Tenant context for an organization API key: its permissions are exactly its scopes. */
  async tenantForApiKey(organizationId: string): Promise<Tenant | null> {
    const org = await this.db.organization.findFirst({ where: { id: organizationId, deletedAt: null, status: 'ACTIVE' }, select: { id: true } });
    return org ? { organizationId, memberId: null, roleKey: null, permissions: new Set<string>(), viaSuperAdmin: false } : null;
  }

  /** Permissions the *current* caller holds in the current scope — the ceiling for what they may grant to others. */
  async grantable(req: AppRequest, userId: string, tenant?: Tenant): Promise<ReadonlySet<string>> {
    const platform = await this.platformAccess(req, userId);
    if (platform.isSuperAdmin) return new Set(Object.keys(PERMISSIONS));
    return tenant ? tenant.permissions : platform.permissions;
  }
}
