import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ENV, parseEnv } from '../src/config/env.js';
import { setupApp } from '../src/setup.js';

describe('API bootstrap', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ENV)
      .useValue(parseEnv({ NODE_ENV: 'test', CORS_ORIGINS: 'http://localhost:3000' }))
      .compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(() => app.close());

  it('serves GET /api/v1/health', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200, { status: 'ok' });
  });

  it('publishes the OpenAPI document', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(res.body.paths).toHaveProperty('/api/v1/health');
  });

  it('allows only configured CORS origins', async () => {
    const ok = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:3000');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:3000');

    const evil = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('parseEnv', () => {
  it('refuses to start without CORS_ORIGINS', () => {
    expect(() => parseEnv({})).toThrow(/CORS_ORIGINS/);
  });
});
