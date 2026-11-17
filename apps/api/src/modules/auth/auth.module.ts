import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { ApiKeyRateLimiter } from './rate-limiter.js';
import { createSupabaseVerifier, TOKEN_VERIFIER } from './token-verifier.js';
import { AuthGuard } from './auth.guard.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    ApiKeyRateLimiter,
    AuthGuard,
    { provide: TOKEN_VERIFIER, useFactory: (env: Env) => createSupabaseVerifier(env), inject: [ENV] },
  ],
  exports: [AuthService, AuthGuard, ApiKeyRateLimiter, TOKEN_VERIFIER],
})
export class AuthModule {}
