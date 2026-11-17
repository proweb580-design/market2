import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { settingsUpdateSchema, type SettingsUpdate } from '@repo/shared';
import { CurrentPrincipal, Req, UserOnly } from '../../common/decorators.js';
import type { AppRequest, Principal } from '../../common/principal.js';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../../common/zod.js';
import { activityQuerySchema, UsersService } from './users.service.js';

const uid = (p: Principal) => (p as { user: { id: string } }).user.id;

/** Everything under /users/me is bound to the verified caller — there is no user id in these URLs to tamper with. */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users/me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('settings')
  @UserOnly()
  settings(@CurrentPrincipal() p: Principal) {
    return this.users.getSettings(uid(p));
  }

  @Patch('settings')
  @UserOnly()
  @ApiZodBody(settingsUpdateSchema)
  updateSettings(@Req() req: AppRequest, @CurrentPrincipal() p: Principal, @Body(new ZodPipe(settingsUpdateSchema)) body: SettingsUpdate) {
    return this.users.updateSettings(req, uid(p), body);
  }

  @Get('sessions')
  @UserOnly()
  @ApiOkResponse({ description: 'Active sessions; `current` marks this device' })
  sessions(@CurrentPrincipal() p: Principal) {
    return this.users.listSessions(uid(p), p.kind === 'user' ? p.sessionId : undefined);
  }

  @Delete('sessions/:sessionId')
  @HttpCode(204)
  @UserOnly()
  revokeSession(@Req() req: AppRequest, @CurrentPrincipal() p: Principal, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.users.revokeSession(req, uid(p), sessionId);
  }

  @Get('activity')
  @UserOnly()
  @ApiZodQuery(activityQuerySchema)
  activity(@CurrentPrincipal() p: Principal, @Query(new ZodPipe(activityQuerySchema)) query: typeof activityQuerySchema._output) {
    return this.users.activity(uid(p), query);
  }

  @Delete()
  @HttpCode(204)
  @UserOnly()
  deleteAccount(@Req() req: AppRequest, @CurrentPrincipal() p: Principal) {
    return this.users.deleteAccount(req, uid(p));
  }
}
