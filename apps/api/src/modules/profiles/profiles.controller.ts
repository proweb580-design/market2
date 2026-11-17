import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { profileUpdateSchema, type ProfileUpdate } from '@repo/shared';
import { CurrentPrincipal, Req, UserOnly } from '../../common/decorators.js';
import type { AppRequest, Principal } from '../../common/principal.js';
import { ApiZodBody, ZodPipe } from '../../common/zod.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

@ApiTags('profiles')
@ApiBearerAuth()
@Controller('profiles')
export class ProfilesController {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('me')
  @UserOnly()
  @ApiOkResponse({ description: 'Own profile' })
  me(@CurrentPrincipal() p: Principal) {
    return this.db.profile.findUniqueOrThrow({ where: { userId: (p as { user: { id: string } }).user.id } });
  }

  @Patch('me')
  @UserOnly()
  @ApiZodBody(profileUpdateSchema)
  async update(@Req() req: AppRequest, @CurrentPrincipal() p: Principal, @Body(new ZodPipe(profileUpdateSchema)) body: ProfileUpdate) {
    const userId = (p as { user: { id: string } }).user.id;
    // The user id comes from the verified token, so a body can never address someone else's profile.
    const profile = await this.db.profile.update({ where: { userId }, data: body });
    await this.audit.record(req, { action: 'profile.updated', entityType: 'profile', entityId: userId, metadata: { fields: Object.keys(body) } });
    return profile;
  }
}
