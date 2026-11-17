import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sha256 } from '../src/common/crypto.js';
import { createTestApp, TEST_DB, type TestCtx, type TestUser } from './helpers.js';

describe.skipIf(!TEST_DB)('API keys', () => {
  let t: TestCtx;
  let owner: TestUser;
  let org: { id: string; slug: string };

  const call = (secret: string, path: string, method: 'get' | 'post' | 'delete' = 'get') =>
    t.http()[method](`/api/v1${path}`).set('X-API-Key', secret);

  const newKey = async (scopes: string[], extra: object = {}) =>
    (await owner.post(`/organizations/${org.id}/api-keys`, { name: 'integration', scopes, ...extra }).expect(201)).body as {
      id: string; secret: string; prefix: string; displayKey: string;
    };

  beforeAll(async () => {
    t = await createTestApp();
    owner = await t.user('keyowner');
    org = await t.createOrg(owner);
  });
  afterAll(() => t.close());

  describe('creation and storage', () => {
    it('returns the secret exactly once and stores only its SHA-256 hash', async () => {
      const key = await newKey(['org.members.read']);
      expect(key.secret).toMatch(/^pk_[0-9a-f]{8}\.[A-Za-z0-9_-]{43}$/);
      expect(key.secret.startsWith(`pk_${key.prefix}.`)).toBe(true);

      const row = await t.db.apiKey.findUniqueOrThrow({ where: { id: key.id } });
      expect(row.keyHash).toBe(sha256(key.secret));
      expect(JSON.stringify(row)).not.toContain(key.secret.split('.')[1]);

      const list = await owner.get(`/organizations/${org.id}/api-keys`).expect(200);
      const text = JSON.stringify(list.body);
      expect(text).not.toContain(key.secret.split('.')[1]);
      expect(text).not.toContain('keyHash');
      expect(text).not.toContain(row.keyHash);
      expect(list.body.find((k: { id: string }) => k.id === key.id).displayKey).toBe(`pk_${key.prefix}…`);
    });

    it('produces unique, unguessable secrets', async () => {
      const [a, b] = [await newKey(['catalog.read']), await newKey(['catalog.read'])];
      expect(a.secret).not.toBe(b.secret);
      expect(a.prefix).not.toBe(b.prefix);
    });

    it('never writes the secret into the audit trail', async () => {
      const key = await newKey(['catalog.read'], { name: 'audited' });
      const logs = await t.db.auditLog.findMany({ where: { entityId: key.id } });
      expect(logs.length).toBeGreaterThan(0);
      expect(JSON.stringify(logs)).not.toContain(key.secret.split('.')[1]);
    });

    it('validates scopes: known, organization-scoped, non-empty, and never more than the creator holds', async () => {
      await owner.post(`/organizations/${org.id}/api-keys`, { name: 'k1', scopes: [] }).expect(400);
      await owner.post(`/organizations/${org.id}/api-keys`, { name: 'k2', scopes: ['made.up'] }).expect(400);
      await owner.post(`/organizations/${org.id}/api-keys`, { name: 'k3', scopes: ['platform.users.manage'] }).expect(422);
      await owner.post(`/organizations/${org.id}/api-keys`, { name: 'k4', scopes: ['catalog.read'], rateLimitPerMinute: 0 }).expect(400);

      const admin = await t.user('keyadmin');
      await t.addMember(org.id, admin, 'ORG_ADMIN'); // lacks org.billing.manage
      await admin.post(`/organizations/${org.id}/api-keys`, { name: 'escalate', scopes: ['org.billing.manage'] }).expect(403);
      await admin.post(`/organizations/${org.id}/api-keys`, { name: 'fine', scopes: ['catalog.read'] }).expect(201);
    });

    it('only members with org.api_keys.manage can create or list keys', async () => {
      const staff = await t.user('keystaff');
      await t.addMember(org.id, staff, 'ORG_STAFF');
      await staff.post(`/organizations/${org.id}/api-keys`, { name: 'nope', scopes: ['catalog.read'] }).expect(403);
      await staff.get(`/organizations/${org.id}/api-keys`).expect(403);
    });
  });

  describe('authentication with a key', () => {
    it('grants exactly the permissions in its scopes', async () => {
      const key = await newKey(['org.members.read', 'catalog.read']);
      await call(key.secret, `/organizations/${org.id}/roles`).expect(200); // needs org.members.read
      await call(key.secret, `/organizations/${org.id}/members`).expect(200);
      await call(key.secret, `/organizations/${org.id}/invitations`).expect(403); // needs org.members.manage
      await call(key.secret, `/organizations/${org.id}/api-keys`).expect(403);
    });

    it('is bound to its organization: any other organization is 404', async () => {
      const other = await t.user('other');
      const otherOrg = await t.createOrg(other);
      const key = await newKey(['org.members.read']);
      await call(key.secret, `/organizations/${otherOrg.id}/members`).expect(404);
      await call(key.secret, `/organizations/${randomUUID()}/members`).expect(404);
    });

    it('can never act as a user: no /auth/me, no creating organizations or minting keys', async () => {
      const key = await newKey(['org.members.read', 'org.api_keys.manage']);
      await call(key.secret, '/auth/me').expect(403);
      await call(key.secret, `/organizations/${org.id}/api-keys`, 'post').send({ name: 'child', scopes: ['org.members.read'] }).expect(403);
      await call(key.secret, '/organizations', 'post').send({ slug: 'from-key', name: 'x' }).expect(403);
      await call(key.secret, '/admin/users').expect(403);
    });

    it('rejects malformed, unknown and tampered keys (401) without revealing which part was wrong', async () => {
      const key = await newKey(['org.members.read']);
      const [prefix, secret] = key.secret.slice(3).split('.');
      const bodies = await Promise.all(
        [
          'garbage',
          'pk_zzzzzzzz.' + 'A'.repeat(43),
          `pk_${prefix}.${'A'.repeat(43)}`, // right prefix, wrong secret
          `pk_${prefix}.${secret}x`,
          `PK_${prefix}.${secret}`,
          '',
        ].map(async (bad) => (await t.http().get('/api/v1/auth/me').set('X-API-Key', bad).expect(401)).body.message),
      );
      expect(new Set(bodies).size).toBe(1);
    });

    it('stops working on revoke, on expiry, or when the organization is suspended', async () => {
      const key = await newKey(['org.members.read']);
      await call(key.secret, `/organizations/${org.id}/members`).expect(200);
      await owner.del(`/organizations/${org.id}/api-keys/${key.id}`).expect(204);
      await call(key.secret, `/organizations/${org.id}/members`).expect(401);
      await owner.del(`/organizations/${org.id}/api-keys/${key.id}`).expect(404); // already revoked

      const expiring = await newKey(['org.members.read'], { expiresInDays: 1 });
      await call(expiring.secret, `/organizations/${org.id}/members`).expect(200);
      await t.db.apiKey.update({ where: { id: expiring.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await call(expiring.secret, `/organizations/${org.id}/members`).expect(401);

      const susp = await t.user('suspowner');
      const suspOrg = await t.createOrg(susp);
      const sk = (await susp.post(`/organizations/${suspOrg.id}/api-keys`, { name: 'sus', scopes: ['org.members.read'] }).expect(201)).body;
      await call(sk.secret, `/organizations/${suspOrg.id}/members`).expect(200);
      await t.db.organization.update({ where: { id: suspOrg.id }, data: { status: 'SUSPENDED' } });
      await call(sk.secret, `/organizations/${suspOrg.id}/members`).expect(403);
    });
  });

  describe('rate limiting and request log', () => {
    it('answers 429 with Retry-After once the per-key limit is exceeded, without affecting other keys', async () => {
      const limited = await newKey(['org.members.read'], { rateLimitPerMinute: 2 });
      const free = await newKey(['org.members.read']);
      await call(limited.secret, `/organizations/${org.id}/members`).expect(200);
      await call(limited.secret, `/organizations/${org.id}/members`).expect(200);
      const res = await call(limited.secret, `/organizations/${org.id}/members`).expect(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      await call(free.secret, `/organizations/${org.id}/members`).expect(200);
    });

    it('logs each call (including refused ones) with path only — no query string, no secret', async () => {
      const key = await newKey(['org.members.read']);
      await call(key.secret, `/organizations/${org.id}/members?token=SENSITIVE`).expect(200);
      await call(key.secret, `/organizations/${org.id}/invitations`).expect(403);

      await vi.waitFor(async () => expect(await t.db.apiLog.count({ where: { apiKeyId: key.id } })).toBe(2), { timeout: 5000 });
      const logs = (await owner.get(`/organizations/${org.id}/api-keys/${key.id}/logs?pageSize=10`).expect(200)).body;
      expect(logs.total).toBe(2);
      expect(logs.items.map((l: { statusCode: number }) => l.statusCode).sort()).toEqual([200, 403]);
      const text = JSON.stringify(logs);
      expect(text).not.toContain('SENSITIVE');
      expect(text).not.toContain(key.secret.split('.')[1]);
      expect(logs.items[0]).toMatchObject({ method: 'GET', path: expect.stringContaining(`/api/v1/organizations/${org.id}/`) });
    });

    it('stamps lastUsedAt', async () => {
      const key = await newKey(['org.members.read']);
      expect((await t.db.apiKey.findUniqueOrThrow({ where: { id: key.id } })).lastUsedAt).toBeNull();
      await call(key.secret, `/organizations/${org.id}/members`).expect(200);
      expect((await t.db.apiKey.findUniqueOrThrow({ where: { id: key.id } })).lastUsedAt).not.toBeNull();
    });
  });

  describe('personal keys', () => {
    it('act as their owner: scopes AND the owner’s live permissions must both allow a call', async () => {
      const staffer = await t.user('persadmin');
      await t.grantPlatformRole(staffer.id, 'MANAGER'); // platform read-only
      const key = (await staffer.post('/api-keys', { name: 'cli', scopes: ['platform.users.read', 'platform.audit.read'] }).expect(201)).body;

      await call(key.secret, '/admin/users').expect(200);
      await call(key.secret, '/admin/stats').expect(403); // role allows it, key scope does not
      await call(key.secret, `/organizations/${org.id}/members`).expect(404); // personal keys never enter organizations
      await call(key.secret, '/auth/me').expect(403);

      // Taking the role away takes the key's power away at once.
      await t.db.userRole.deleteMany({ where: { userId: staffer.id } });
      await call(key.secret, '/admin/users').expect(403);
    });

    it('cannot be created with scopes the user does not hold, and cannot touch another user’s keys', async () => {
      const nobody = await t.user('nobody');
      await nobody.post('/api-keys', { name: 'greedy', scopes: ['platform.users.manage'] }).expect(403);
      await nobody.post('/api-keys', { name: 'org', scopes: ['catalog.read'] }).expect(422);

      const holder = await t.user('holder');
      await t.grantPlatformRole(holder.id, 'MANAGER');
      const key = (await holder.post('/api-keys', { name: 'mine', scopes: ['platform.stats.read'] }).expect(201)).body;
      await nobody.del(`/api-keys/${key.id}`).expect(404);
      await nobody.get(`/api-keys/${key.id}/logs`).expect(404);
      expect((await nobody.get('/api-keys').expect(200)).body).toEqual([]);
      expect((await holder.get('/api-keys').expect(200)).body).toHaveLength(1);
      await holder.del(`/api-keys/${key.id}`).expect(204);
    });

    it('platform admins can see and revoke any key', async () => {
      const root = await t.user('keyroot');
      await t.grantPlatformRole(root.id, 'SUPER_ADMIN');
      const key = await newKey(['org.members.read']);
      const all = await root.get('/admin/api-keys?pageSize=100').expect(200);
      expect(all.body.items.some((k: { id: string }) => k.id === key.id)).toBe(true);
      expect(JSON.stringify(all.body)).not.toContain('keyHash');
      await root.del(`/admin/api-keys/${key.id}`).expect(204);
      await call(key.secret, `/organizations/${org.id}/members`).expect(401);
    });
  });
});
