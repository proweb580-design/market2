import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createApiKeySchema } from '@repo/shared';
import { z } from 'zod';
import { CurrentPrincipal, CurrentTenant, Req, RequirePermissions, UserOnly } from '../../common/decorators.js';
import type { AppRequest, Principal, Tenant } from '../../common/principal.js';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../../common/zod.js';
import { AccessService } from '../access/access.service.js';
import { RequireFeature } from '../billing/subscription.guard.js';
import { ApiKeysService, logsQuerySchema } from './api-keys.service.js';

type Create = z.infer<typeof createApiKeySchema>;
type Logs = z.infer<typeof logsQuerySchema>;
const userId = (p: Principal) => (p as { user: { id: string } }).user.id;

/** Keys that belong to an organization (integrations for the brand). Only signed-in users manage them — a key can't mint keys. */
@ApiTags('api-keys')
@ApiBearerAuth()
@Controller('organizations/:orgId/api-keys')
export class OrganizationApiKeysController {
  constructor(
    private readonly keys: ApiKeysService,
    private readonly access: AccessService,
  ) {}

  @Post()
  @UserOnly()
  @RequirePermissions('org.api_keys.manage')
  @RequireFeature('api_access')
  @ApiZodBody(createApiKeySchema)
  async create(@Req() req: AppRequest, @CurrentPrincipal() p: Principal, @CurrentTenant() tenant: Tenant, @Body(new ZodPipe(createApiKeySchema)) body: Create) {
    const grantable = await this.access.grantable(req, userId(p), tenant);
    return this.keys.create(req, { organizationId: tenant.organizationId, userId: userId(p) }, grantable, body);
  }

  @Get()
  @UserOnly()
  @RequirePermissions('org.api_keys.manage')
  list(@CurrentPrincipal() p: Principal, @CurrentTenant() tenant: Tenant) {
    return this.keys.list({ organizationId: tenant.organizationId, userId: userId(p) });
  }

  @Delete(':keyId')
  @HttpCode(204)
  @UserOnly()
  @RequirePermissions('org.api_keys.manage')
  revoke(@Req() req: AppRequest, @CurrentPrincipal() p: Principal, @CurrentTenant() tenant: Tenant, @Param('keyId', ParseUUIDPipe) keyId: string) {
    return this.keys.revoke(req, { organizationId: tenant.organizationId, userId: userId(p) }, keyId);
  }

  @Get(':keyId/logs')
  @UserOnly()
  @RequirePermissions('org.api_keys.manage')
  @ApiZodQuery(logsQuerySchema)
  logs(@CurrentPrincipal() p: Principal, @CurrentTenant() tenant: Tenant, @Param('keyId', ParseUUIDPipe) keyId: string, @Query(new ZodPipe(logsQuerySchema)) q: Logs) {
    return this.keys.logs({ organizationId: tenant.organizationId, userId: userId(p) }, keyId, q);
  }
}

/** Personal keys act as their owner, limited to the key's scopes ∩ the owner's live platform permissions. */
@ApiTags('api-keys')
@ApiBearerAuth()
@Controller('api-keys')
export class PersonalApiKeysController {
  constructor(
    private readonly keys: ApiKeysService,
    private readonly access: AccessService,
  ) {}

  @Post()
  @UserOnly()
  @ApiZodBody(createApiKeySchema)
  async create(@Req() req: AppRequest, @CurrentPrincipal() p: Principal, @Body(new ZodPipe(createApiKeySchema)) body: Create) {
    const grantable = await this.access.grantable(req, userId(p));
    return this.keys.create(req, { organizationId: null, userId: userId(p) }, grantable, body);
  }

  @Get()
  @UserOnly()
  list(@CurrentPrincipal() p: Principal) {
    return this.keys.list({ organizationId: null, userId: userId(p) });
  }

  @Delete(':keyId')
  @HttpCode(204)
  @UserOnly()
  revoke(@Req() req: AppRequest, @CurrentPrincipal() p: Principal, @Param('keyId', ParseUUIDPipe) keyId: string) {
    return this.keys.revoke(req, { organizationId: null, userId: userId(p) }, keyId);
  }

  @Get(':keyId/logs')
  @UserOnly()
  @ApiZodQuery(logsQuerySchema)
  logs(@CurrentPrincipal() p: Principal, @Param('keyId', ParseUUIDPipe) keyId: string, @Query(new ZodPipe(logsQuerySchema)) q: Logs) {
    return this.keys.logs({ organizationId: null, userId: userId(p) }, keyId, q);
  }
}
