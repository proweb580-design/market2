import { Module } from '@nestjs/common';
import { OrganizationApiKeysController, PersonalApiKeysController } from './api-keys.controller.js';
import { ApiKeysService } from './api-keys.service.js';

@Module({
  controllers: [OrganizationApiKeysController, PersonalApiKeysController],
  providers: [ApiKeysService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
