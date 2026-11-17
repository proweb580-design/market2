import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupApp } from './setup.js';

// Local dev convenience; deployed environments inject real env vars.
if (existsSync('.env')) process.loadEnvFile('.env');

const app = await NestFactory.create(AppModule);
const env = setupApp(app);
await app.listen(env.PORT);
