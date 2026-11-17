import { type INestApplication, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ENV, type Env } from './config/env.js';

// Money and Telegram ids are BIGINT; JSON has no bigint, and every value we store is far below 2^53.
(BigInt.prototype as unknown as { toJSON(): number }).toJSON = function (this: bigint) {
  return Number(this);
};

/** HTTP setup shared by main.ts and the API tests, so tests hit the same /api/v1 routes. */
export function setupApp(app: INestApplication): Env {
  const env = app.get<Env>(ENV);

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.enableShutdownHooks();
  // Behind a reverse proxy the client IP (rate limits, audit trail) comes from X-Forwarded-For.
  if (env.TRUST_PROXY) (app.getHttpAdapter().getInstance() as { set(k: string, v: unknown): void }).set('trust proxy', 1);
  // The API serves JSON only; reduce what a browser would do with a mistaken HTML response.
  (app.getHttpAdapter().getInstance() as { disable(k: string): void }).disable('x-powered-by');

  if (env.SWAGGER_ENABLED) {
    const config = new DocumentBuilder()
      .setTitle('Platform API')
      .setVersion('1')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, 'api-key')
      .build();
    SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, config));
  }

  return env;
}
