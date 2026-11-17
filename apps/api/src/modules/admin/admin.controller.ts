import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { adminUsersQuerySchema, auditQuerySchema, blockUserSchema, paginationQuerySchema } from '@repo/shared';
import { z } from 'zod';
import { CurrentPrincipal, Req, RequirePermissions, UserOnly } from '../../common/decorators.js';
import type { AppRequest, Principal } from '../../common/principal.js';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../../common/zod.js';
import { AdminService } from './admin.service.js';

const settingKey = z.string().regex(/^[a-z][a-z0-9_.]{0,59}$/);
const settingBody = z.object({ value: z.unknown().refine((v) => JSON.stringify(v ?? null).length <= 16_000, 'Value too large') }).strict();
const actorId = (p: Principal) => (p as { user: { id: string } }).user.id;

/** Platform back office. Every route names the exact permission it needs; SUPER_ADMIN passes all of them. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  @RequirePermissions('platform.stats.read')
  stats() {
    return this.admin.stats();
  }

  @Get('users')
  @RequirePermissions('platform.users.read')
  @ApiZodQuery(adminUsersQuerySchema)
  users(@Query(new ZodPipe(adminUsersQuerySchema)) q: z.infer<typeof adminUsersQuerySchema>) {
    return this.admin.listUsers(q);
  }

  @Get('users/:userId')
  @RequirePermissions('platform.users.read')
  user(@Param('userId', ParseUUIDPipe) id: string) {
    return this.admin.getUser(id);
  }

  @Post('users/:userId/block')
  @HttpCode(204)
  @UserOnly()
  @RequirePermissions('platform.users.manage')
  @ApiZodBody(blockUserSchema)
  block(@Req() req: AppRequest, @CurrentPrincipal() p: Principal, @Param('userId', ParseUUIDPipe) id: string, @Body(new ZodPipe(blockUserSchema)) body: z.infer<typeof blockUserSchema>) {
    return this.admin.blockUser(req, actorId(p), id, body);
  }

  @Post('users/:userId/unblock')
  @HttpCode(204)
  @RequirePermissions('platform.users.manage')
  unblock(@Req() req: AppRequest, @Param('userId', ParseUUIDPipe) id: string) {
    return this.admin.unblockUser(req, id);
  }

  @Get('organizations')
  @RequirePermissions('platform.organizations.read')
  @ApiZodQuery(paginationQuerySchema)
  organizations(@Query(new ZodPipe(paginationQuerySchema)) q: z.infer<typeof paginationQuerySchema>) {
    return this.admin.listOrganizations(q);
  }

  @Post('organizations/:organizationId/suspend')
  @HttpCode(204)
  @RequirePermissions('platform.organizations.manage')
  suspend(@Req() req: AppRequest, @Param('organizationId', ParseUUIDPipe) id: string) {
    return this.admin.setOrganizationStatus(req, id, 'SUSPENDED');
  }

  @Post('organizations/:organizationId/activate')
  @HttpCode(204)
  @RequirePermissions('platform.organizations.manage')
  activate(@Req() req: AppRequest, @Param('organizationId', ParseUUIDPipe) id: string) {
    return this.admin.setOrganizationStatus(req, id, 'ACTIVE');
  }

  @Get('audit-logs')
  @RequirePermissions('platform.audit.read')
  @ApiZodQuery(auditQuerySchema)
  audit(@Query(new ZodPipe(auditQuerySchema)) q: z.infer<typeof auditQuerySchema>) {
    return this.admin.auditLogs(q);
  }

  @Get('api-keys')
  @RequirePermissions('platform.api_keys.read')
  @ApiZodQuery(paginationQuerySchema)
  apiKeys(@Query(new ZodPipe(paginationQuerySchema)) q: z.infer<typeof paginationQuerySchema>) {
    return this.admin.listApiKeys(q);
  }

  @Delete('api-keys/:keyId')
  @HttpCode(204)
  @RequirePermissions('platform.api_keys.manage')
  revokeKey(@Req() req: AppRequest, @Param('keyId', ParseUUIDPipe) id: string) {
    return this.admin.revokeApiKey(req, id);
  }

  @Get('settings')
  @RequirePermissions('platform.settings.manage')
  settings() {
    return this.admin.listSettings();
  }

  @Put('settings/:key')
  @UserOnly()
  @RequirePermissions('platform.settings.manage')
  @ApiZodBody(settingBody)
  putSetting(@Req() req: AppRequest, @CurrentPrincipal() p: Principal, @Param('key', new ZodPipe(settingKey)) key: string, @Body(new ZodPipe(settingBody)) body: { value: unknown }) {
    return this.admin.putSetting(req, actorId(p), key, body.value);
  }
}
