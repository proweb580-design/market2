import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { z } from 'zod';
import type { createInvitationSchema, createOrganizationSchema, updateOrganizationSchema } from '@repo/shared';
import { randomToken, sha256 } from '../../common/crypto.js';
import type { AppRequest, Tenant } from '../../common/principal.js';
import { Prisma } from '../../generated/prisma/client.js';
import { ENV, type Env } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Inject } from '@nestjs/common';

const MAX_OWNED_ORGANIZATIONS = 5;

/** Who is acting inside an organization, for the owner / escalation rules. */
export interface OrgActor {
  userId: string;
  tenant: Tenant;
}
const isOwnerActor = (a: OrgActor) => a.tenant.viaSuperAdmin || a.tenant.roleKey === 'ORG_OWNER';

const orgSelect = { id: true, slug: true, name: true, status: true, logoUrl: true, currency: true, customDomain: true, settings: true, createdAt: true } as const;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ── organizations ──

  async create(req: AppRequest, userId: string, dto: z.infer<typeof createOrganizationSchema>) {
    const owned = await this.db.organizationMember.count({
      where: { userId, role: { key: 'ORG_OWNER', organizationId: null }, organization: { deletedAt: null } },
    });
    if (owned >= MAX_OWNED_ORGANIZATIONS) throw new ForbiddenException(`You can own at most ${MAX_OWNED_ORGANIZATIONS} organizations`);

    const ownerRole = await this.db.role.findFirstOrThrow({ where: { key: 'ORG_OWNER', organizationId: null }, select: { id: true } });
    try {
      return await this.db.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: { slug: dto.slug, name: dto.name, currency: dto.currency, createdById: userId },
          select: orgSelect,
        });
        await tx.organizationMember.create({ data: { organizationId: org.id, userId, roleId: ownerRole.id } });
        await this.audit.record(req, { action: 'organization.created', organizationId: org.id, entityType: 'organization', entityId: org.id, metadata: { slug: dto.slug } }, tx);
        // Phase 6 attaches the Free plan subscription here, inside the same transaction.
        return org;
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('This store address is already taken');
      throw error;
    }
  }

  async listMine(userId: string) {
    const rows = await this.db.organizationMember.findMany({
      where: { userId, status: 'ACTIVE', organization: { deletedAt: null } },
      select: { organization: { select: orgSelect }, role: { select: { key: true, name: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map((r) => ({ ...r.organization, role: r.role }));
  }

  async get(tenant: Tenant) {
    return this.db.organization.findUniqueOrThrow({ where: { id: tenant.organizationId }, select: orgSelect });
  }

  async update(req: AppRequest, tenant: Tenant, dto: z.infer<typeof updateOrganizationSchema>) {
    const org = await this.db.organization.update({
      where: { id: tenant.organizationId },
      data: { ...dto, settings: dto.settings as Prisma.InputJsonValue | undefined },
      select: orgSelect,
    });
    await this.audit.record(req, { action: 'organization.updated', organizationId: tenant.organizationId, entityType: 'organization', entityId: org.id, metadata: { fields: Object.keys(dto) } });
    return org;
  }

  // ── roles inside an organization ──

  /** A role may be given in an organization only if it is an organization role that is system-wide or the org's own. */
  private async assignableRole(actor: OrgActor, roleId: string) {
    const role = await this.db.role.findFirst({
      where: { id: roleId, scope: 'ORGANIZATION', OR: [{ organizationId: null }, { organizationId: actor.tenant.organizationId }] },
      select: { id: true, key: true, isSystem: true, permissions: { select: { permission: { select: { key: true } } } } },
    });
    if (!role) throw new UnprocessableEntityException('Role is not available in this organization');
    const isOwnerRole = role.isSystem && role.key === 'ORG_OWNER';
    if (isOwnerRole && !isOwnerActor(actor)) throw new ForbiddenException('Only an owner can assign the Owner role');
    if (!actor.tenant.viaSuperAdmin) {
      const missing = role.permissions.map((p) => p.permission.key).filter((k) => !actor.tenant.permissions.has(k));
      if (missing.length) throw new ForbiddenException('You cannot assign a role with permissions you do not hold');
    }
    return { ...role, isOwnerRole };
  }

  private async ownerCount(organizationId: string) {
    return this.db.organizationMember.count({
      where: { organizationId, status: 'ACTIVE', role: { key: 'ORG_OWNER', organizationId: null } },
    });
  }

  // ── members ──

  async listMembers(tenant: Tenant) {
    const rows = await this.db.organizationMember.findMany({
      where: { organizationId: tenant.organizationId },
      orderBy: { joinedAt: 'asc' },
      select: {
        id: true,
        status: true,
        joinedAt: true,
        user: { select: { id: true, email: true, profile: { select: { displayName: true, avatarUrl: true } } } },
        role: { select: { id: true, key: true, name: true, isSystem: true } },
      },
    });
    return rows;
  }

  private async memberInOrg(organizationId: string, memberId: string) {
    // organizationId in the filter is the IDOR guard: a member id from another organization is "not found".
    const member = await this.db.organizationMember.findFirst({
      where: { id: memberId, organizationId },
      select: { id: true, userId: true, role: { select: { key: true, isSystem: true } } },
    });
    if (!member) throw new NotFoundException('Member not found');
    return { ...member, isOwner: member.role.isSystem && member.role.key === 'ORG_OWNER' };
  }

  async updateMember(req: AppRequest, actor: OrgActor, memberId: string, roleId: string) {
    const member = await this.memberInOrg(actor.tenant.organizationId, memberId);
    if (member.isOwner && !isOwnerActor(actor)) throw new ForbiddenException('Only an owner can change an owner');
    const role = await this.assignableRole(actor, roleId);
    if (member.isOwner && !role.isOwnerRole && (await this.ownerCount(actor.tenant.organizationId)) <= 1) {
      throw new ConflictException('An organization must keep at least one owner');
    }
    await this.db.$transaction(async (tx) => {
      await tx.organizationMember.update({ where: { id: memberId }, data: { roleId } });
      await this.audit.record(req, { action: 'member.role_changed', organizationId: actor.tenant.organizationId, entityType: 'member', entityId: memberId, metadata: { roleKey: role.key } }, tx);
    });
  }

  async removeMember(req: AppRequest, actor: OrgActor, memberId: string) {
    const member = await this.memberInOrg(actor.tenant.organizationId, memberId);
    if (member.isOwner && !isOwnerActor(actor)) throw new ForbiddenException('Only an owner can remove an owner');
    await this.detach(req, actor.tenant.organizationId, member, 'member.removed');
  }

  async leave(req: AppRequest, tenant: Tenant) {
    if (!tenant.memberId) throw new ForbiddenException('Not a member of this organization');
    const member = await this.memberInOrg(tenant.organizationId, tenant.memberId);
    await this.detach(req, tenant.organizationId, member, 'member.left');
  }

  private async detach(req: AppRequest, organizationId: string, member: { id: string; userId: string; isOwner: boolean }, action: string) {
    if (member.isOwner && (await this.ownerCount(organizationId)) <= 1) {
      throw new ConflictException('An organization must keep at least one owner');
    }
    await this.db.$transaction(async (tx) => {
      await tx.organizationMember.delete({ where: { id: member.id } });
      // Keys the departing member minted for the organization stop working with them.
      await tx.apiKey.updateMany({ where: { organizationId, createdById: member.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record(req, { action, organizationId, entityType: 'member', entityId: member.id }, tx);
    });
  }

  // ── invitations ──

  async createInvitation(req: AppRequest, actor: OrgActor, dto: z.infer<typeof createInvitationSchema>) {
    const { organizationId } = actor.tenant;
    const role = await this.assignableRole(actor, dto.roleId);
    const existing = await this.db.organizationMember.findFirst({ where: { organizationId, user: { email: dto.email } }, select: { id: true } });
    if (existing) throw new ConflictException('This person is already a member');

    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + this.env.INVITATION_TTL_DAYS * 86_400_000);
    let invitation;
    try {
      invitation = await this.db.$transaction(async (tx) => {
        // An expired, never-used invitation must not block inviting the same email again.
        await tx.invitation.updateMany({
          where: { organizationId, email: dto.email, acceptedAt: null, revokedAt: null, expiresAt: { lte: new Date() } },
          data: { revokedAt: new Date() },
        });
        const row = await tx.invitation.create({
          data: { organizationId, email: dto.email, roleId: dto.roleId, tokenHash: sha256(token), invitedById: actor.userId, expiresAt },
          select: { id: true, email: true, expiresAt: true, createdAt: true },
        });
        await this.audit.record(req, { action: 'invitation.created', organizationId, entityType: 'invitation', entityId: row.id, metadata: { email: dto.email, roleKey: role.key } }, tx);
        return row;
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('An invitation for this email is already pending');
      throw error;
    }
    // The raw token exists only in this response (and, once a mailer is connected, in the email link).
    return { ...invitation, role: { id: role.id, key: role.key }, token };
  }

  listInvitations(tenant: Tenant) {
    return this.db.invitation.findMany({
      where: { organizationId: tenant.organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, expiresAt: true, createdAt: true, role: { select: { id: true, key: true, name: true } } },
    });
  }

  async revokeInvitation(req: AppRequest, tenant: Tenant, invitationId: string) {
    const { count } = await this.db.invitation.updateMany({
      where: { id: invitationId, organizationId: tenant.organizationId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!count) throw new NotFoundException('Invitation not found');
    await this.audit.record(req, { action: 'invitation.revoked', organizationId: tenant.organizationId, entityType: 'invitation', entityId: invitationId });
  }

  async acceptInvitation(req: AppRequest, user: { id: string; email: string | null }, token: string) {
    const notFound = new NotFoundException('Invitation not found or expired');
    const invitation = await this.db.invitation.findUnique({
      where: { tokenHash: sha256(token) },
      select: { id: true, organizationId: true, email: true, roleId: true, expiresAt: true, acceptedAt: true, revokedAt: true, organization: { select: { status: true, deletedAt: true } } },
    });
    // Every failure looks identical, so a token cannot be probed for state or for which email it targets.
    if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) throw notFound;
    if (invitation.organization.deletedAt || invitation.organization.status !== 'ACTIVE') throw notFound;
    if (!user.email || user.email !== invitation.email) throw notFound;

    try {
      await this.db.$transaction(async (tx) => {
        await tx.organizationMember.create({ data: { organizationId: invitation.organizationId, userId: user.id, roleId: invitation.roleId, invitedById: null } });
        const { count } = await tx.invitation.updateMany({ where: { id: invitation.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } });
        if (!count) throw notFound; // lost a race with a concurrent accept/revoke
        await this.audit.record(req, { action: 'invitation.accepted', organizationId: invitation.organizationId, entityType: 'invitation', entityId: invitation.id }, tx);
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('You are already a member of this organization');
      throw error;
    }
    return { organizationId: invitation.organizationId };
  }
}
