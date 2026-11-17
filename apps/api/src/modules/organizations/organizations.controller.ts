import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  createOrganizationSchema,
  updateMemberSchema,
  updateOrganizationSchema,
} from '@repo/shared';
import { z } from 'zod';
import { CurrentPrincipal, CurrentTenant, MemberOnly, Req, RequirePermissions, UserOnly } from '../../common/decorators.js';
import type { AppRequest, Principal, Tenant } from '../../common/principal.js';
import { ApiZodBody, ZodPipe } from '../../common/zod.js';
import { OrganizationsService, type OrgActor } from './organizations.service.js';

const user = (p: Principal) => (p as { user: { id: string; email: string | null } }).user;
const actor = (p: Principal, tenant: Tenant): OrgActor => ({ userId: user(p).id, tenant });

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Post()
  @UserOnly()
  @ApiZodBody(createOrganizationSchema)
  create(@Req() req: AppRequest, @CurrentPrincipal() p: Principal, @Body(new ZodPipe(createOrganizationSchema)) body: z.infer<typeof createOrganizationSchema>) {
    return this.orgs.create(req, user(p).id, body);
  }

  @Get()
  @UserOnly()
  list(@CurrentPrincipal() p: Principal) {
    return this.orgs.listMine(user(p).id);
  }

  @Get(':orgId')
  @MemberOnly()
  get(@CurrentTenant() tenant: Tenant, @Param('orgId', ParseUUIDPipe) _orgId: string) {
    return this.orgs.get(tenant);
  }

  @Patch(':orgId')
  @RequirePermissions('org.settings.manage')
  @ApiZodBody(updateOrganizationSchema)
  update(@Req() req: AppRequest, @CurrentTenant() tenant: Tenant, @Body(new ZodPipe(updateOrganizationSchema)) body: z.infer<typeof updateOrganizationSchema>) {
    return this.orgs.update(req, tenant, body);
  }

  @Post(':orgId/leave')
  @HttpCode(204)
  @MemberOnly()
  leave(@Req() req: AppRequest, @CurrentTenant() tenant: Tenant) {
    return this.orgs.leave(req, tenant);
  }

  // ── members ──

  @Get(':orgId/members')
  @RequirePermissions('org.members.read')
  members(@CurrentTenant() tenant: Tenant) {
    return this.orgs.listMembers(tenant);
  }

  @Patch(':orgId/members/:memberId')
  @HttpCode(204)
  @UserOnly()
  @RequirePermissions('org.members.manage')
  @ApiZodBody(updateMemberSchema)
  updateMember(
    @Req() req: AppRequest,
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() tenant: Tenant,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body(new ZodPipe(updateMemberSchema)) body: { roleId: string },
  ) {
    return this.orgs.updateMember(req, actor(p, tenant), memberId, body.roleId);
  }

  @Delete(':orgId/members/:memberId')
  @HttpCode(204)
  @UserOnly()
  @RequirePermissions('org.members.manage')
  removeMember(@Req() req: AppRequest, @CurrentPrincipal() p: Principal, @CurrentTenant() tenant: Tenant, @Param('memberId', ParseUUIDPipe) memberId: string) {
    return this.orgs.removeMember(req, actor(p, tenant), memberId);
  }

  // ── invitations ──

  @Get(':orgId/invitations')
  @RequirePermissions('org.members.manage')
  invitations(@CurrentTenant() tenant: Tenant) {
    return this.orgs.listInvitations(tenant);
  }

  @Post(':orgId/invitations')
  @UserOnly()
  @RequirePermissions('org.members.manage')
  @ApiZodBody(createInvitationSchema)
  invite(@Req() req: AppRequest, @CurrentPrincipal() p: Principal, @CurrentTenant() tenant: Tenant, @Body(new ZodPipe(createInvitationSchema)) body: z.infer<typeof createInvitationSchema>) {
    return this.orgs.createInvitation(req, actor(p, tenant), body);
  }

  @Delete(':orgId/invitations/:invitationId')
  @HttpCode(204)
  @UserOnly()
  @RequirePermissions('org.members.manage')
  revoke(@Req() req: AppRequest, @CurrentTenant() tenant: Tenant, @Param('invitationId', ParseUUIDPipe) invitationId: string) {
    return this.orgs.revokeInvitation(req, tenant, invitationId);
  }
}

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Post('accept')
  @UserOnly()
  @ApiZodBody(acceptInvitationSchema)
  accept(@Req() req: AppRequest, @CurrentPrincipal() p: Principal, @Body(new ZodPipe(acceptInvitationSchema)) body: { token: string }) {
    return this.orgs.acceptInvitation(req, user(p), body.token);
  }
}
