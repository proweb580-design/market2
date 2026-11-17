import { type INestApplication, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ENV, type Env } from './config/env.js';

/** HTTP setup shared by main.ts and the API tests, so tests hit the same /api/v1 routes. */
export function setupApp(app: INestApplication): Env {
  const env = app.get<Env>(ENV);

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.enableShutdownHooks();

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
