import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, TEST_DB, type TestCtx } from './helpers.js';

describe.skipIf(!TEST_DB)('authentication, sessions and account lifecycle', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  describe('bearer tokens', () => {
    it('rejects requests with no credentials, garbage, a foreign signature, expiry or wrong audience (401)', async () => {
      await t.http().get('/api/v1/auth/me').expect(401);
      await t.http().get('/api/v1/auth/me').set('Authorization', 'Bearer abc.def.ghi').expect(401);
      await t.http().get('/api/v1/auth/me').set('Authorization', 'Basic Zm9vOmJhcg==').expect(401);
      const expired = await t.sign({ expiresAt: Math.floor(Date.now() / 1000) - 60 });
      await t.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`).expect(401);
      const wrongAud = await t.sign({ audience: 'anon' });
      await t.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${wrongAud}`).expect(401);
    });

    it('creates the platform user (profile + settings) on first sight and reuses it afterwards', async () => {
      const u = await t.user('first');
      const again = await u.get('/auth/me').expect(200);
      expect(again.body).toMatchObject({ id: u.id, email: u.email, status: 'ACTIVE', platformRoles: [], organizations: [], isSuperAdmin: false });
      expect(again.body.profile).toMatchObject({ locale: 'ru' });
      expect(again.body.settings).toMatchObject({ theme: 'SYSTEM', marketingEmails: false });
      expect(await t.db.user.count({ where: { supabaseId: u.sub } })).toBe(1);
    });

    it('never stores or links an unverified email', async () => {
      const email = `unverified-${randomUUID().slice(0, 8)}@example.com`;
      const token = await t.sign({ email, emailVerified: false });
      const res = await t.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body.email).toBeNull();
      expect(await t.db.user.count({ where: { email } })).toBe(0);
    });

    it('links a pre-created user (e.g. the seeded super admin) by verified email instead of duplicating it', async () => {
      const email = `seeded-${randomUUID().slice(0, 8)}@example.com`;
      const seeded = await t.db.user.create({ data: { email } });
      const token = await t.sign({ email, emailVerified: true });
      const res = await t.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body.id).toBe(seeded.id);
    });

    it('refuses an email that already belongs to a different linked account (409)', async () => {
      const taken = await t.user('taken');
      const token = await t.sign({ email: taken.email, emailVerified: true });
      await t.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(409);
    });

    it('rejects sending a bearer token together with an API key (400)', async () => {
      const u = await t.user();
      await t.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${u.token}`).set('X-API-Key', 'pk_00000000.x').expect(400);
    });
  });

  describe('fail-closed authorization', () => {
    it('refuses a route that declares no access rule, even for a signed-in user (403)', async () => {
      const u = await t.user();
      const res = await u.get('/naked').expect(403);
      expect(res.body.message).toMatch(/no access rule/i);
      await t.http().get('/api/v1/naked').expect(401);
    });

    it('serves public routes without credentials', async () => {
      await t.http().get('/api/v1/health').expect(200);
    });
  });

  describe('error responses', () => {
    it('use one shape with a request id and never leak internals', async () => {
      const u = await t.user();
      const res = await u.patch('/profiles/me', { userId: randomUUID() }).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, message: 'Validation failed' });
      expect(res.body.requestId).toBe(res.headers['x-request-id']);
      expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts|prisma|SELECT/i);
    });
  });

  describe('blocking and sessions', () => {
    it('applies a block immediately to a still-valid token and lifts it on unblock', async () => {
      const admin = await t.user('admin');
      await t.grantPlatformRole(admin.id, 'ADMIN');
      const victim = await t.user('victim');

      await victim.get('/auth/me').expect(200);
      await admin.post(`/admin/users/${victim.id}/block`, { reason: 'spam' }).expect(204);
      await victim.get('/auth/me').expect(403);
      expect((await t.db.user.findUniqueOrThrow({ where: { id: victim.id } })).blockedReason).toBe('spam');

      await admin.post(`/admin/users/${victim.id}/unblock`).expect(204);
      // The block also closed the session it was using, so the same token keeps being refused…
      await victim.get('/auth/me').expect(401);
      // …while a fresh login (new session id) works.
      const again = await t.sign({ sub: victim.sub, email: victim.email });
      await t.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${again}`).expect(200);
    });

    it('logout revokes this device only', async () => {
      const u = await t.user('logout');
      const second = await t.sign({ sub: u.sub, email: u.email }); // another device
      await t.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${second}`).expect(200);

      await u.post('/auth/logout').expect(204);
      await u.get('/auth/me').expect(401);
      await t.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${second}`).expect(200);
    });

    it('lists own sessions, marks the current one and revokes another device', async () => {
      const u = await t.user('sessions');
      const otherToken = await t.sign({ sub: u.sub, email: u.email });
      await t.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${otherToken}`).expect(200);

      const list = await u.get('/users/me/sessions').expect(200);
      expect(list.body).toHaveLength(2);
      const current = list.body.find((s: { current: boolean }) => s.current);
      const other = list.body.find((s: { current: boolean }) => !s.current);
      expect(current).toBeDefined();

      await u.del(`/users/me/sessions/${other.id}`).expect(204);
      await t.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${otherToken}`).expect(401);
      await u.get('/auth/me').expect(200);
    });

    it("cannot revoke someone else's session (IDOR → 404) and cannot reuse another user's session id", async () => {
      const [a, b] = [await t.user('a'), await t.user('b')];
      const bSession = await t.db.session.findFirstOrThrow({ where: { userId: b.id } });
      await a.del(`/users/me/sessions/${bSession.id}`).expect(404);
      expect((await t.db.session.findUniqueOrThrow({ where: { id: bSession.id } })).revokedAt).toBeNull();

      const hijack = await t.sign({ email: 'h@example.com', sessionId: b.sessionId });
      await t.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${hijack}`).expect(401);
    });
  });

  describe('profile, settings, activity', () => {
    it('updates only the caller’s own profile and validates input', async () => {
      const u = await t.user('profile');
      const res = await u.patch('/profiles/me', { displayName: 'Alex', locale: 'en', phone: '+7 900 123-45-67' }).expect(200);
      expect(res.body).toMatchObject({ userId: u.id, displayName: 'Alex', locale: 'en' });
      await u.patch('/profiles/me', { phone: 'abc' }).expect(400);
      await u.patch('/profiles/me', { avatarUrl: 'http://insecure.example/a.png' }).expect(400);
      await u.patch('/profiles/me', { avatarUrl: 'javascript:alert(1)' }).expect(400);
      await u.patch('/profiles/me', { userId: randomUUID() }).expect(400);
    });

    it('updates settings and rejects non-boolean notification values', async () => {
      const u = await t.user('settings');
      const res = await u.patch('/users/me/settings', { theme: 'DARK', marketingEmails: true, notifications: { orders: { email: true } } }).expect(200);
      expect(res.body).toMatchObject({ theme: 'DARK', marketingEmails: true });
      await u.patch('/users/me/settings', { notifications: { orders: { email: 'yes' } } }).expect(400);
      await u.patch('/users/me/settings', { theme: 'NEON' }).expect(400);
    });

    it('shows the caller’s own activity history, newest first and paginated', async () => {
      const u = await t.user('activity');
      await u.patch('/profiles/me', { displayName: 'One' }).expect(200);
      await u.patch('/users/me/settings', { theme: 'LIGHT' }).expect(200);
      const res = await u.get('/users/me/activity?pageSize=1').expect(200);
      expect(res.body).toMatchObject({ page: 1, pageSize: 1, total: 2 });
      expect(res.body.items[0].action).toBe('settings.updated');
      await u.get('/users/me/activity?pageSize=1000').expect(400);
    });
  });

  describe('account deletion', () => {
    it('anonymises the account, frees the email and blocks further sign-in', async () => {
      const u = await t.user('bye');
      await u.patch('/profiles/me', { displayName: 'Bye' }).expect(200);
      await u.del('/users/me').expect(204);

      const row = await t.db.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(row).toMatchObject({ status: 'DELETED', email: null });
      expect(await t.db.profile.count({ where: { userId: u.id } })).toBe(0);
      await u.get('/auth/me').expect(403); // the old token is refused: "Account was deleted"
      const fresh = await t.sign({ sub: u.sub, email: u.email });
      await t.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${fresh}`).expect(403);
    });

    it('refuses while the user is the only owner of an organization', async () => {
      const owner = await t.user('solo');
      const org = await t.createOrg(owner);
      const res = await owner.del('/users/me').expect(409);
      expect(res.body.details.organizations).toContain(org.slug);
      expect((await t.db.user.findUniqueOrThrow({ where: { id: owner.id } })).status).toBe('ACTIVE');
    });
  });
});
