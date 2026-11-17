import { Module } from '@nestjs/common';
import { OrganizationRolesController, PermissionsController, RolesController } from './rbac.controller.js';
import { RolesService } from './roles.service.js';

@Module({
  controllers: [PermissionsController, RolesController, OrganizationRolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RbacModule {}
