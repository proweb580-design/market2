import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadEnv } from './config/load-env.js';
import { setupApp } from './setup.js';

// Local dev convenience; deployed environments inject real env vars.
loadEnv();

// rawBody: payment webhooks verify their signature over the exact bytes received.
const app = await NestFactory.create(AppModule, { rawBody: true });
const env = setupApp(app);
await app.listen(env.PORT);
