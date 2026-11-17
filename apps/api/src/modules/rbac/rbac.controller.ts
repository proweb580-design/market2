import { Body, Controller, Delete, Get, HttpCode, Injectable, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  assignRoleSchema,
  createRoleSchema,
  PERMISSIONS,
  updateRoleSchema,
} from '@repo/shared';
import { z } from 'zod';
import { CurrentPrincipal, CurrentTenant, RequirePermissions, Req, UserOnly } from '../../common/decorators.js';
import type { AppRequest, Principal, Tenant } from '../../common/principal.js';
import { ApiZodBody, ZodPipe } from '../../common/zod.js';
import { AccessService } from '../access/access.service.js';
import { RolesService, type RoleActor } from './roles.service.js';

type Create = z.infer<typeof createRoleSchema>;
type Update = z.infer<typeof updateRoleSchema>;
const userId = (p: Principal) => (p as { user: { id: string } }).user.id;

// @Injectable makes TypeScript emit constructor param types, which subclasses inherit for DI.
@Injectable()
abstract class RbacBase {
  constructor(
    protected readonly roles: RolesService,
    protected readonly access: AccessService,
  ) {}

  protected async actor(req: AppRequest, p: Principal, tenant?: Tenant): Promise<RoleActor> {
    const platform = await this.access.platformAccess(req, userId(p));
    return { grantable: await this.access.grantable(req, userId(p), tenant), isSuperAdmin: platform.isSuperAdmin };
  }
}

@ApiTags('permissions')
@ApiBearerAuth()
@Controller('permissions')
export class PermissionsController {
  /** The permission catalogue — static reference data, safe for any signed-in user (role editors need it). */
  @Get()
  @UserOnly()
  list() {
    return Object.entries(PERMISSIONS).map(([key, v]) => ({ key, ...v }));
  }
}

/** Platform-level roles (admin panel). */
@ApiTags('roles')
@ApiBearerAuth()
@Controller()
export class RolesController extends RbacBase {
  @Get('roles')
  @RequirePermissions('platform.roles.manage')
  list() {
    return this.roles.list({ organizationId: null });
  }

  @Post('roles')
  @RequirePermissions('platform.roles.manage')
  @ApiZodBody(createRoleSchema)
  async create(@Req() req: AppRequest, @CurrentPrincipal() p: Principal, @Body(new ZodPipe(createRoleSchema)) body: Create) {
    return this.roles.create(req, { organizationId: null }, await this.actor(req, p), body);
  }

  @Patch('roles/:roleId')
  @RequirePermissions('platform.roles.manage')
  @ApiZodBody(updateRoleSchema)
  async update(@Req() req: AppRequest, @CurrentPrincipal() p: Principal, @Param('roleId', ParseUUIDPipe) roleId: string, @Body(new ZodPipe(updateRoleSchema)) body: Update) {
    return this.roles.update(req, { organizationId: null }, await this.actor(req, p), roleId, body);
  }

  @Delete('roles/:roleId')
  @HttpCode(204)
  @RequirePermissions('platform.roles.manage')
  remove(@Req() req: AppRequest, @Param('roleId', ParseUUIDPipe) roleId: string) {
    return this.roles.remove(req, { organizationId: null }, roleId);
  }

  @Post('users/:userId/roles')
  @HttpCode(204)
  @RequirePermissions('platform.roles.manage')
  @ApiZodBody(assignRoleSchema)
  async assign(@Req() req: AppRequest, @CurrentPrincipal() p: Principal, @Param('userId', ParseUUIDPipe) target: string, @Body(new ZodPipe(assignRoleSchema)) body: { roleId: string }) {
    await this.roles.assignPlatformRole(req, await this.actor(req, p), target, body.roleId);
  }

  @Delete('users/:userId/roles/:roleId')
  @HttpCode(204)
  @RequirePermissions('platform.roles.manage')
  async unassign(@Req() req: AppRequest, @CurrentPrincipal() p: Principal, @Param('userId', ParseUUIDPipe) target: string, @Param('roleId', ParseUUIDPipe) roleId: string) {
    await this.roles.unassignPlatformRole(req, await this.actor(req, p), target, roleId);
  }
}

/** Organization roles: system roles are visible to everyone, custom roles belong to exactly one organization. */
@ApiTags('roles')
@ApiBearerAuth()
@Controller('organizations/:orgId/roles')
export class OrganizationRolesController extends RbacBase {
  @Get()
  @RequirePermissions('org.members.read')
  list(@CurrentTenant() tenant: Tenant) {
    return this.roles.list({ organizationId: tenant.organizationId });
  }

  @Post()
  @UserOnly()
  @RequirePermissions('org.roles.manage')
  @ApiZodBody(createRoleSchema)
  async create(@Req() req: AppRequest, @CurrentPrincipal() p: Principal, @CurrentTenant() tenant: Tenant, @Body(new ZodPipe(createRoleSchema)) body: Create) {
    return this.roles.create(req, { organizationId: tenant.organizationId }, await this.actor(req, p, tenant), body);
  }

  @Patch(':roleId')
  @UserOnly()
  @RequirePermissions('org.roles.manage')
  @ApiZodBody(updateRoleSchema)
  async update(@Req() req: AppRequest, @CurrentPrincipal() p: Principal, @CurrentTenant() tenant: Tenant, @Param('roleId', ParseUUIDPipe) roleId: string, @Body(new ZodPipe(updateRoleSchema)) body: Update) {
    return this.roles.update(req, { organizationId: tenant.organizationId }, await this.actor(req, p, tenant), roleId, body);
  }

  @Delete(':roleId')
  @HttpCode(204)
  @UserOnly()
  @RequirePermissions('org.roles.manage')
  remove(@Req() req: AppRequest, @CurrentTenant() tenant: Tenant, @Param('roleId', ParseUUIDPipe) roleId: string) {
    return this.roles.remove(req, { organizationId: tenant.organizationId }, roleId);
  }
}
