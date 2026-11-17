import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, Req, UserOnly } from '../../common/decorators.js';
import type { AppRequest, Principal } from '../../common/principal.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AccessService } from '../access/access.service.js';
import { AuditService } from '../audit/audit.service.js';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly db: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  /** Who am I: account, platform roles/permissions and organization memberships. The frontend's single bootstrap call. */
  @Get('me')
  @UserOnly()
  @ApiOkResponse({ description: 'Current user with roles, permissions and organizations' })
  async me(@Req() req: AppRequest, @CurrentPrincipal() principal: Principal) {
    if (principal.kind !== 'user') throw new Error('unreachable: @UserOnly');
    const [user, platform, memberships] = await Promise.all([
      this.db.user.findUniqueOrThrow({
        where: { id: principal.user.id },
        select: { id: true, email: true, status: true, createdAt: true, profile: true, settings: true, telegramAccount: { select: { username: true, linkedAt: true } } },
      }),
      this.access.platformAccess(req, principal.user.id),
      this.db.organizationMember.findMany({
        where: { userId: principal.user.id, status: 'ACTIVE', organization: { deletedAt: null } },
        select: { organization: { select: { id: true, slug: true, name: true, status: true } }, role: { select: { key: true, name: true } } },
      }),
    ]);
    return {
      ...user,
      platformRoles: platform.roleKeys,
      platformPermissions: [...platform.permissions].sort(),
      isSuperAdmin: platform.isSuperAdmin,
      organizations: memberships.map((m) => ({ ...m.organization, role: m.role })),
    };
  }

  /** Signs this device out on our side. The Supabase session is ended by the frontend (`supabase.auth.signOut()`). */
  @Post('logout')
  @HttpCode(204)
  @UserOnly()
  async logout(@Req() req: AppRequest, @CurrentPrincipal() principal: Principal) {
    if (principal.kind !== 'user' || !principal.sessionId) return;
    await this.db.session.updateMany({ where: { id: principal.sessionId, userId: principal.user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.record(req, { action: 'auth.logout', entityType: 'session', entityId: principal.sessionId });
  }
}
