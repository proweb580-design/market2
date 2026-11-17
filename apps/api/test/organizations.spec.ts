import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, TEST_DB, type TestCtx, type TestUser } from './helpers.js';

describe.skipIf(!TEST_DB)('organizations: tenancy, members, invitations', () => {
  let t: TestCtx;
  let alice: TestUser; // owner of org A
  let bob: TestUser; // owner of org B
  let orgA: { id: string; slug: string };
  let orgB: { id: string; slug: string };

  beforeAll(async () => {
    t = await createTestApp();
    [alice, bob] = [await t.user('alice'), await t.user('bob')];
    [orgA, orgB] = [await t.createOrg(alice), await t.createOrg(bob)];
  });
  afterAll(() => t.close());

  describe('creating organizations', () => {
    it('makes the creator the owner and lists it under "mine"', async () => {
      const me = await alice.get('/auth/me').expect(200);
      expect(me.body.organizations).toEqual([expect.objectContaining({ id: orgA.id, role: expect.objectContaining({ key: 'ORG_OWNER' }) })]);
      const mine = await alice.get('/organizations').expect(200);
      expect(mine.body.map((o: { id: string }) => o.id)).toEqual([orgA.id]);
    });

    it('validates the store address and rejects duplicates (400 / 409)', async () => {
      await alice.post('/organizations', { slug: 'Bad Slug', name: 'Nope' }).expect(400);
      await alice.post('/organizations', { slug: 'x', name: 'Nope' }).expect(400);
      await alice.post('/organizations', { slug: orgB.slug, name: 'Clash' }).expect(409);
      await alice.post('/organizations', { slug: `ok-${randomUUID().slice(0, 6)}`, name: 'Ok', isAdmin: true }).expect(400);
    });

    it('limits how many organizations one user can own', async () => {
      const u = await t.user('prolific');
      for (let i = 0; i < 5; i++) await t.createOrg(u);
      await u.post('/organizations', { slug: `extra-${randomUUID().slice(0, 6)}`, name: 'Extra' }).expect(403);
    });
  });

  describe('cross-tenant isolation (IDOR): one brand can never reach another brand’s data', () => {
    let bobMemberId: string;
    let bobRoleId: string;
    let bobKeyId: string;
    let bobInvitationId: string;

    beforeAll(async () => {
      bobMemberId = (await t.db.organizationMember.findFirstOrThrow({ where: { organizationId: orgB.id, userId: bob.id } })).id;
      bobRoleId = (await bob.post(`/organizations/${orgB.id}/roles`, { key: 'PACKER', name: 'Packer', permissions: ['orders.read'] }).expect(201)).body.id;
      bobKeyId = (await bob.post(`/organizations/${orgB.id}/api-keys`, { name: 'bobs key', scopes: ['catalog.read'] }).expect(201)).body.id;
      bobInvitationId = (await bob.post(`/organizations/${orgB.id}/invitations`, { email: 'someone@example.com', roleId: (await t.systemRole('ORG_STAFF')).id }).expect(201)).body.id;
    });

    it("Alice gets 404 — not 403 — for every route of Bob's organization", async () => {
      const staff = (await t.systemRole('ORG_STAFF')).id;
      await alice.get(`/organizations/${orgB.id}`).expect(404);
      await alice.patch(`/organizations/${orgB.id}`, { name: 'Pwned' }).expect(404);
      await alice.get(`/organizations/${orgB.id}/members`).expect(404);
      await alice.get(`/organizations/${orgB.id}/roles`).expect(404);
      await alice.get(`/organizations/${orgB.id}/invitations`).expect(404);
      await alice.get(`/organizations/${orgB.id}/api-keys`).expect(404);
      await alice.post(`/organizations/${orgB.id}/invitations`, { email: 'x@example.com', roleId: staff }).expect(404);
      await alice.post(`/organizations/${orgB.id}/leave`).expect(404);
      expect((await t.db.organization.findUniqueOrThrow({ where: { id: orgB.id } })).name).not.toBe('Pwned');
    });

    it('malformed and nonexistent organization ids look the same (404)', async () => {
      await alice.get('/organizations/not-a-uuid').expect(404);
      await alice.get(`/organizations/${randomUUID()}`).expect(404);
      await alice.get(`/organizations/${randomUUID()}/members`).expect(404);
      await alice.get("/organizations/' OR '1'='1/members").expect(404);
    });

    it("a child id from Bob's organization used inside Alice's own URL matches nothing", async () => {
      const staff = (await t.systemRole('ORG_STAFF')).id;
      await alice.patch(`/organizations/${orgA.id}/members/${bobMemberId}`, { roleId: staff }).expect(404);
      await alice.del(`/organizations/${orgA.id}/members/${bobMemberId}`).expect(404);
      await alice.patch(`/organizations/${orgA.id}/roles/${bobRoleId}`, { name: 'Hijacked' }).expect(404);
      await alice.del(`/organizations/${orgA.id}/roles/${bobRoleId}`).expect(404);
      await alice.del(`/organizations/${orgA.id}/api-keys/${bobKeyId}`).expect(404);
      await alice.get(`/organizations/${orgA.id}/api-keys/${bobKeyId}/logs`).expect(404);
      await alice.del(`/organizations/${orgA.id}/invitations/${bobInvitationId}`).expect(404);

      // Nothing of Bob's changed.
      expect(await t.db.organizationMember.count({ where: { id: bobMemberId } })).toBe(1);
      expect((await t.db.role.findUniqueOrThrow({ where: { id: bobRoleId } })).name).toBe('Packer');
      expect((await t.db.apiKey.findUniqueOrThrow({ where: { id: bobKeyId } })).revokedAt).toBeNull();
      expect((await t.db.invitation.findUniqueOrThrow({ where: { id: bobInvitationId } })).revokedAt).toBeNull();
    });

    it("a custom role of one organization cannot be given to a member of another", async () => {
      const carol = await t.user('carol');
      const member = await t.addMember(orgA.id, carol, 'ORG_STAFF');
      await alice.patch(`/organizations/${orgA.id}/members/${member.id}`, { roleId: bobRoleId }).expect(422);
      await alice.post(`/organizations/${orgA.id}/invitations`, { email: 'newbie@example.com', roleId: bobRoleId }).expect(422);
    });

    it("the SUPER_ADMIN is the only outsider who can enter an organization", async () => {
      const root = await t.user('root');
      await t.grantPlatformRole(root.id, 'SUPER_ADMIN');
      await root.get(`/organizations/${orgB.id}/members`).expect(200);
    });
  });

  describe('permissions inside an organization', () => {
    it('a staff member can enter the organization but not administer it', async () => {
      const staff = await t.user('staff');
      await t.addMember(orgA.id, staff, 'ORG_STAFF');
      await staff.get(`/organizations/${orgA.id}`).expect(200);
      await staff.get(`/organizations/${orgA.id}/members`).expect(403);
      await staff.get(`/organizations/${orgA.id}/api-keys`).expect(403);
      await staff.patch(`/organizations/${orgA.id}`, { name: 'Mine now' }).expect(403);
      await staff.post(`/organizations/${orgA.id}/invitations`, { email: 'z@example.com', roleId: (await t.systemRole('ORG_STAFF')).id }).expect(403);
      await staff.post(`/organizations/${orgA.id}/roles`, { key: 'ROGUE', name: 'Rogue', permissions: ['orders.read'] }).expect(403);
    });

    it('permissions come from the role in THIS organization, not from another one', async () => {
      const dual = await t.user('dual');
      await t.addMember(orgA.id, dual, 'ORG_STAFF'); // weak in A
      await t.addMember(orgB.id, dual, 'ORG_ADMIN'); // strong in B
      await dual.get(`/organizations/${orgB.id}/members`).expect(200);
      await dual.get(`/organizations/${orgA.id}/members`).expect(403);
    });

    it('updates organization details with validation and records the change', async () => {
      await alice.patch(`/organizations/${orgA.id}`, { name: 'Alice Wear', logoUrl: 'https://cdn.example.com/l.png', settings: { accent: '#fff' } }).expect(200);
      await alice.patch(`/organizations/${orgA.id}`, { logoUrl: 'http://insecure.example/l.png' }).expect(400);
      await alice.patch(`/organizations/${orgA.id}`, { slug: 'renamed' }).expect(400);
      await alice.patch(`/organizations/${orgA.id}`, { currency: 'EUR' }).expect(400);
      expect(await t.db.auditLog.count({ where: { organizationId: orgA.id, action: 'organization.updated' } })).toBe(1);
    });

    it('blocks a suspended organization for its members but not for the super admin', async () => {
      const owner = await t.user('susp');
      const org = await t.createOrg(owner);
      const root = await t.user('root2');
      await t.grantPlatformRole(root.id, 'SUPER_ADMIN');
      await root.post(`/admin/organizations/${org.id}/suspend`).expect(204);
      await owner.get(`/organizations/${org.id}`).expect(403);
      await root.get(`/organizations/${org.id}`).expect(200);
      await root.post(`/admin/organizations/${org.id}/activate`).expect(204);
      await owner.get(`/organizations/${org.id}`).expect(200);
    });
  });

  describe('custom organization roles', () => {
    it('are created inside one organization, limited to org-scoped permissions and the creator’s own', async () => {
      const res = await alice.post(`/organizations/${orgA.id}/roles`, { key: 'PHOTOGRAPHER', name: 'Photographer', permissions: ['catalog.read', 'content.write'] }).expect(201);
      expect(res.body).toMatchObject({ organizationId: orgA.id, isSystem: false, scope: 'ORGANIZATION' });
      await alice.post(`/organizations/${orgA.id}/roles`, { key: 'BADPLAT', name: 'Bad plat', permissions: ['platform.users.read'] }).expect(422);
      await alice.post(`/organizations/${orgA.id}/roles`, { key: 'ORG_OWNER', name: 'Spoof', permissions: [] }).expect(422);

      const roles = await alice.get(`/organizations/${orgA.id}/roles`).expect(200);
      const keys = roles.body.map((r: { key: string }) => r.key);
      expect(keys).toEqual(expect.arrayContaining(['ORG_OWNER', 'ORG_ADMIN', 'ORG_MANAGER', 'ORG_STAFF', 'PHOTOGRAPHER']));
      expect(keys).not.toContain('PACKER'); // Bob's custom role is invisible here
      expect(keys).not.toContain('SUPER_ADMIN');
    });

    it('cannot be deleted while a member or pending invitation holds it', async () => {
      const role = (await alice.post(`/organizations/${orgA.id}/roles`, { key: 'TEMPROLE', name: 'Temp', permissions: ['catalog.read'] }).expect(201)).body;
      const dave = await t.user('dave');
      const invite = (await alice.post(`/organizations/${orgA.id}/invitations`, { email: dave.email, roleId: role.id }).expect(201)).body;
      expect((await alice.del(`/organizations/${orgA.id}/roles/${role.id}`).expect(409)).body.details).toMatchObject({ pendingInvitations: 1 });
      await alice.del(`/organizations/${orgA.id}/invitations/${invite.id}`).expect(204);
      await alice.del(`/organizations/${orgA.id}/roles/${role.id}`).expect(204);
    });

    it('a custom role keyed like "ORG_OWNER" can never be mistaken for the owner', async () => {
      // Created directly in the DB, bypassing the API's reserved-key check, to prove the second line of defence.
      const owner = await t.user('spoofer-owner');
      const org = await t.createOrg(owner);
      const sneaky = await t.db.role.create({ data: { key: 'ORG_OWNER', name: 'Sneaky', scope: 'ORGANIZATION', organizationId: org.id, isSystem: false } });
      const eve = await t.user('eve');
      await t.db.organizationMember.create({ data: { organizationId: org.id, userId: eve.id, roleId: sneaky.id } });
      const adminRole = await t.systemRole('ORG_ADMIN');
      const member = await t.db.organizationMember.findFirstOrThrow({ where: { organizationId: org.id, userId: owner.id } });
      // Eve has no permissions via the sneaky role, and is not treated as an owner either.
      await eve.get(`/organizations/${org.id}/members`).expect(403);
      await eve.patch(`/organizations/${org.id}/members/${member.id}`, { roleId: adminRole.id }).expect(403);
    });
  });

  describe('members and the "last owner" rule', () => {
    it('an owner is never removed or demoted when they are the only one (409)', async () => {
      const owner = await t.user('lonely');
      const org = await t.createOrg(owner);
      const self = await t.db.organizationMember.findFirstOrThrow({ where: { organizationId: org.id, userId: owner.id } });
      await owner.post(`/organizations/${org.id}/leave`).expect(409);
      await owner.del(`/organizations/${org.id}/members/${self.id}`).expect(409);
      await owner.patch(`/organizations/${org.id}/members/${self.id}`, { roleId: (await t.systemRole('ORG_ADMIN')).id }).expect(409);

      // With a second owner the first may step down.
      const heir = await t.user('heir');
      await t.addMember(org.id, heir, 'ORG_OWNER');
      await owner.post(`/organizations/${org.id}/leave`).expect(204);
      await owner.get(`/organizations/${org.id}`).expect(404);
    });

    it('an admin cannot touch or create owners, nor hand out permissions they lack', async () => {
      const owner = await t.user('o1');
      const org = await t.createOrg(owner);
      const adminUser = await t.user('adm');
      await t.addMember(org.id, adminUser, 'ORG_ADMIN');
      const ownerMember = await t.db.organizationMember.findFirstOrThrow({ where: { organizationId: org.id, userId: owner.id } });
      const ownerRole = await t.systemRole('ORG_OWNER');
      const staffRole = await t.systemRole('ORG_STAFF');

      await adminUser.patch(`/organizations/${org.id}/members/${ownerMember.id}`, { roleId: staffRole.id }).expect(403);
      await adminUser.del(`/organizations/${org.id}/members/${ownerMember.id}`).expect(403);
      await adminUser.post(`/organizations/${org.id}/invitations`, { email: 'new-owner@example.com', roleId: ownerRole.id }).expect(403);
      const adm = await t.db.organizationMember.findFirstOrThrow({ where: { organizationId: org.id, userId: adminUser.id } });
      await adminUser.patch(`/organizations/${org.id}/members/${adm.id}`, { roleId: ownerRole.id }).expect(403); // self-promotion
      // ORG_ADMIN lacks org.billing.manage, so it cannot create a role that has it.
      await adminUser.post(`/organizations/${org.id}/roles`, { key: 'BILLER', name: 'Biller', permissions: ['org.billing.manage'] }).expect(403);
    });

    it('lists members with their roles; removal revokes the member’s API keys', async () => {
      const owner = await t.user('o2');
      const org = await t.createOrg(owner);
      const member = await t.user('m2');
      const row = await t.addMember(org.id, member, 'ORG_ADMIN');
      const key = (await member.post(`/organizations/${org.id}/api-keys`, { name: 'm2 key', scopes: ['catalog.read'] }).expect(201)).body;

      const list = await owner.get(`/organizations/${org.id}/members`).expect(200);
      expect(list.body.map((m: { role: { key: string } }) => m.role.key).sort()).toEqual(['ORG_ADMIN', 'ORG_OWNER']);

      await owner.del(`/organizations/${org.id}/members/${row.id}`).expect(204);
      expect((await t.db.apiKey.findUniqueOrThrow({ where: { id: key.id } })).revokedAt).not.toBeNull();
      await member.get(`/organizations/${org.id}`).expect(404);
    });
  });

  describe('invitations', () => {
    it('invite → accept: creates the membership with the invited role, once', async () => {
      const owner = await t.user('inviter');
      const org = await t.createOrg(owner);
      const guest = await t.user('guest');
      const manager = await t.systemRole('ORG_MANAGER');

      const inv = (await owner.post(`/organizations/${org.id}/invitations`, { email: guest.email.toUpperCase(), roleId: manager.id }).expect(201)).body;
      expect(inv).toMatchObject({ email: guest.email, role: { key: 'ORG_MANAGER' } });
      expect(inv.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      // Only the hash is stored.
      const stored = await t.db.invitation.findUniqueOrThrow({ where: { id: inv.id } });
      expect(stored.tokenHash).not.toBe(inv.token);
      expect(JSON.stringify(stored)).not.toContain(inv.token);
      // The list never exposes tokens.
      expect(JSON.stringify((await owner.get(`/organizations/${org.id}/invitations`).expect(200)).body)).not.toContain(inv.token);

      await owner.post(`/organizations/${org.id}/invitations`, { email: guest.email, roleId: manager.id }).expect(409); // already pending
      await guest.post('/invitations/accept', { token: inv.token }).expect(201);
      const me = await guest.get('/auth/me').expect(200);
      expect(me.body.organizations[0]).toMatchObject({ id: org.id, role: { key: 'ORG_MANAGER' } });

      await guest.post('/invitations/accept', { token: inv.token }).expect(404); // single use
      await owner.post(`/organizations/${org.id}/invitations`, { email: guest.email, roleId: manager.id }).expect(409); // already a member
    });

    it('is useless to anyone but the invited email, expired, revoked or forged — all indistinguishable (404)', async () => {
      const owner = await t.user('inviter2');
      const org = await t.createOrg(owner);
      const target = await t.user('target');
      const thief = await t.user('thief');
      const staff = await t.systemRole('ORG_STAFF');
      const mk = async (email: string) => (await owner.post(`/organizations/${org.id}/invitations`, { email, roleId: staff.id }).expect(201)).body;

      const forThief = await mk(target.email);
      const wrongUser = await thief.post('/invitations/accept', { token: forThief.token }).expect(404);
      await thief.post('/invitations/accept', { token: 'A'.repeat(43) }).expect(404);
      expect(wrongUser.body.message).toBe('Invitation not found or expired');
      expect(await t.db.organizationMember.count({ where: { organizationId: org.id, userId: thief.id } })).toBe(0);

      await t.db.invitation.update({ where: { id: forThief.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await target.post('/invitations/accept', { token: forThief.token }).expect(404);

      const toRevoke = await mk(target.email);
      await owner.del(`/organizations/${org.id}/invitations/${toRevoke.id}`).expect(204);
      await target.post('/invitations/accept', { token: toRevoke.token }).expect(404);

      await target.post('/invitations/accept', { token: 'short' }).expect(400);
      await t.http().post('/api/v1/invitations/accept').send({ token: toRevoke.token }).expect(401);
    });

    it('an unverified-email user (no stored email) cannot accept', async () => {
      const owner = await t.user('inviter3');
      const org = await t.createOrg(owner);
      const staff = await t.systemRole('ORG_STAFF');
      const email = `ghost-${randomUUID().slice(0, 6)}@example.com`;
      const inv = (await owner.post(`/organizations/${org.id}/invitations`, { email, roleId: staff.id }).expect(201)).body;
      const token = await t.sign({ email, emailVerified: false });
      const bearer = { Authorization: `Bearer ${token}` };
      await t.http().get('/api/v1/auth/me').set(bearer).expect(200);
      await t.http().post('/api/v1/invitations/accept').set(bearer).send({ token: inv.token }).expect(404);
    });
  });
});
