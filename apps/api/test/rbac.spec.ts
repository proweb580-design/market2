import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERMISSION_KEYS } from '@repo/shared';
import { createTestApp, TEST_DB, type TestCtx, type TestUser } from './helpers.js';

describe.skipIf(!TEST_DB)('RBAC: roles, permissions and platform admin', () => {
  let t: TestCtx;
  let superAdmin: TestUser;
  let admin: TestUser;
  let manager: TestUser;
  let plain: TestUser;

  beforeAll(async () => {
    t = await createTestApp();
    [superAdmin, admin, manager, plain] = [await t.user('super'), await t.user('admin'), await t.user('manager'), await t.user('plain')];
    await t.grantPlatformRole(superAdmin.id, 'SUPER_ADMIN');
    await t.grantPlatformRole(admin.id, 'ADMIN');
    await t.grantPlatformRole(manager.id, 'MANAGER');
  });
  afterAll(() => t.close());

  describe('every admin route enforces its permission on the server', () => {
    const adminRoutes: [string, string][] = [
      ['get', '/admin/stats'],
      ['get', '/admin/users'],
      ['get', `/admin/users/${randomUUID()}`],
      ['get', '/admin/organizations'],
      ['get', '/admin/audit-logs'],
      ['get', '/admin/api-keys'],
      ['get', '/admin/settings'],
      ['get', '/roles'],
    ];

    it.each(adminRoutes)('a signed-in user without roles gets 403 on %s %s', async (_m, path) => {
      await plain.get(path).expect(403);
    });

    it('rejects unauthenticated access with 401, not 403', async () => {
      await t.http().get('/api/v1/admin/users').expect(401);
    });

    it('MANAGER (read-only) can read but not change anything', async () => {
      await manager.get('/admin/users').expect(200);
      await manager.get('/admin/audit-logs').expect(200);
      await manager.post(`/admin/users/${plain.id}/block`, {}).expect(403);
      await manager.get('/roles').expect(403); // platform.roles.manage is not a read permission
      await manager.get('/admin/settings').expect(403);
    });

    it('SUPER_ADMIN passes every check', async () => {
      for (const [, path] of adminRoutes.filter(([, p]) => !p.includes('/users/'))) await superAdmin.get(path).expect(200);
    });
  });

  describe('permission catalogue', () => {
    it('is readable by any signed-in user and lists every key with its scope', async () => {
      const res = await plain.get('/permissions').expect(200);
      expect(res.body.map((p: { key: string }) => p.key).sort()).toEqual([...PERMISSION_KEYS].sort());
      expect(res.body.find((p: { key: string }) => p.key === 'catalog.write').scope).toBe('ORGANIZATION');
      await t.http().get('/api/v1/permissions').expect(401);
    });
  });

  describe('custom platform roles', () => {
    const key = () => `SUPPORT_${randomUUID().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;

    it('SUPER_ADMIN creates, edits and deletes a role; an unassigned role is deletable', async () => {
      const k = key();
      const created = await superAdmin.post('/roles', { key: k, name: 'Support', permissions: ['platform.users.read'] }).expect(201);
      expect(created.body).toMatchObject({ key: k, isSystem: false, scope: 'PLATFORM', permissions: ['platform.users.read'] });

      const edited = await superAdmin.patch(`/roles/${created.body.id}`, { name: 'Support L2', permissions: ['platform.users.read', 'platform.audit.read'] }).expect(200);
      expect(edited.body.permissions).toEqual(['platform.audit.read', 'platform.users.read']);
      await superAdmin.del(`/roles/${created.body.id}`).expect(204);
      await superAdmin.del(`/roles/${created.body.id}`).expect(404);
    });

    it('blocks deleting a role that is still assigned and reports the dependency (409)', async () => {
      const role = (await superAdmin.post('/roles', { key: key(), name: 'Temp', permissions: ['platform.stats.read'] }).expect(201)).body;
      const holder = await t.user('holder');
      await superAdmin.post(`/users/${holder.id}/roles`, { roleId: role.id }).expect(204);
      const res = await superAdmin.del(`/roles/${role.id}`).expect(409);
      expect(res.body.details).toMatchObject({ platformUsers: 1 });
      await holder.get('/admin/stats').expect(200); // the assignment really grants the permission
      await superAdmin.del(`/users/${holder.id}/roles/${role.id}`).expect(204);
      await holder.get('/admin/stats').expect(403);
      await superAdmin.del(`/roles/${role.id}`).expect(204);
    });

    it('protects system roles and reserved keys', async () => {
      const superRole = await t.systemRole('SUPER_ADMIN');
      await superAdmin.patch(`/roles/${superRole.id}`, { name: 'Hacked' }).expect(409);
      await superAdmin.del(`/roles/${superRole.id}`).expect(409);
      await superAdmin.post('/roles', { key: 'SUPER_ADMIN', name: 'Dup', permissions: [] }).expect(422);
      await superAdmin.post('/roles', { key: 'ORG_OWNER', name: 'Spoof', permissions: [] }).expect(422);
      await superAdmin.post('/roles', { key: 'lower_case', name: 'Bad', permissions: [] }).expect(400);
    });

    it('rejects organization permissions in a platform role and unknown permission keys', async () => {
      await superAdmin.post('/roles', { key: key(), name: 'Mixed', permissions: ['catalog.write'] }).expect(422);
      await superAdmin.post('/roles', { key: key(), name: 'Unknown', permissions: ['made.up'] }).expect(400);
    });
  });

  describe('privilege escalation', () => {
    it('ADMIN (no platform.roles.manage) cannot manage roles at all', async () => {
      await admin.post('/roles', { key: 'ESC_ONE', name: 'x', permissions: [] }).expect(403);
    });

    it('a delegate can only grant permissions they hold themselves', async () => {
      const delegate = await t.user('delegate');
      const base = (await superAdmin.post('/roles', { key: `DELEGATE_${randomUUID().slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`, name: 'Delegate', permissions: ['platform.roles.manage', 'platform.users.read'] }).expect(201)).body;
      await superAdmin.post(`/users/${delegate.id}/roles`, { roleId: base.id }).expect(204);

      // Holds roles.manage + users.read → may create a role with users.read, but not one with users.manage.
      await delegate.post('/roles', { key: `OK_${randomUUID().slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`, name: 'ok', permissions: ['platform.users.read'] }).expect(201);
      await delegate.post('/roles', { key: `BAD_${randomUUID().slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`, name: 'bad', permissions: ['platform.users.manage'] }).expect(403);
      // Cannot assign SUPER_ADMIN, nor a role stronger than their own, nor edit a role to add a permission they lack.
      const superRole = await t.systemRole('SUPER_ADMIN');
      await delegate.post(`/users/${plain.id}/roles`, { roleId: superRole.id }).expect(403);
      const adminRole = await t.systemRole('ADMIN');
      await delegate.post(`/users/${plain.id}/roles`, { roleId: adminRole.id }).expect(403);
      await delegate.patch(`/roles/${base.id}`, { permissions: ['platform.roles.manage', 'platform.users.read', 'platform.payments.refund'] }).expect(403);
    });

    it('never removes the last SUPER_ADMIN', async () => {
      await t.db.userRole.deleteMany({ where: { role: { key: 'SUPER_ADMIN' } } });
      const only = await t.user('only-super');
      await t.grantPlatformRole(only.id, 'SUPER_ADMIN');
      const superRole = await t.systemRole('SUPER_ADMIN');
      const res = await only.del(`/users/${only.id}/roles/${superRole.id}`).expect(409);
      expect(res.body.message).toMatch(/last SUPER_ADMIN/);
      // Re-establish the shared fixture for the remaining tests.
      await t.grantPlatformRole(superAdmin.id, 'SUPER_ADMIN');
    });
  });

  describe('moderation', () => {
    it('ADMIN blocks a regular user, but not a super admin, a stronger user or themselves', async () => {
      const victim = await t.user('victim');
      await admin.post(`/admin/users/${victim.id}/block`, { reason: 'abuse' }).expect(204);
      expect((await t.db.user.findUniqueOrThrow({ where: { id: victim.id } })).status).toBe('BLOCKED');

      await admin.post(`/admin/users/${superAdmin.id}/block`, {}).expect(403);
      await admin.post(`/admin/users/${admin.id}/block`, {}).expect(409);
      await manager.post(`/admin/users/${plain.id}/block`, {}).expect(403);
      expect((await t.db.user.findUniqueOrThrow({ where: { id: superAdmin.id } })).status).toBe('ACTIVE');
    });

    it('lists users with filtering, pagination and whitelisted sorting', async () => {
      const res = await admin.get('/admin/users?status=BLOCKED&pageSize=5&sort=-createdAt').expect(200);
      expect(res.body.items.every((u: { status: string }) => u.status === 'BLOCKED')).toBe(true);
      expect(res.body.items.length).toBeLessThanOrEqual(5);
      await admin.get('/admin/users?sort=supabaseId').expect(400);
      await admin.get("/admin/users?q=' OR 1=1 --").expect(200); // parameterised: just matches nothing
      await admin.get('/admin/users?status=HACKED').expect(400);
      await admin.get('/admin/users?page=0').expect(400);
    });

    it('records moderation in the audit log, searchable by action', async () => {
      const res = await superAdmin.get('/admin/audit-logs?action=user.blocked&pageSize=5').expect(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(res.body.items[0]).toMatchObject({ action: 'user.blocked', actorUserId: admin.id });
    });

    it('stores platform settings (SUPER_ADMIN only) with validated keys', async () => {
      await superAdmin.put('/admin/settings/maintenance.banner', { value: { text: 'Back soon' } }).expect(200);
      await superAdmin.put('/admin/settings/Bad Key', { value: 1 }).expect(400);
      await admin.put('/admin/settings/maintenance.banner', { value: 1 }).expect(403);
      const all = await superAdmin.get('/admin/settings').expect(200);
      expect(all.body.find((s: { key: string }) => s.key === 'maintenance.banner').value).toEqual({ text: 'Back soon' });
    });

    it('reports platform statistics', async () => {
      const res = await admin.get('/admin/stats').expect(200);
      expect(res.body.users.active).toBeGreaterThan(0);
      expect(res.body.users.blocked).toBeGreaterThan(0);
    });
  });
});
