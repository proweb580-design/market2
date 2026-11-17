import { randomBytes } from 'node:crypto';
import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PERMISSIONS, paginationQuerySchema, type PaginationQuery, type createApiKeySchema } from '@repo/shared';
import { z } from 'zod';
import { randomToken, sha256 } from '../../common/crypto.js';
import { pageArgs, parseSort, toPage } from '../../common/pagination.js';
import type { AppRequest } from '../../common/principal.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

/** organizationId set → organization key; null → personal key of `userId`. */
export interface KeyOwner {
  organizationId: string | null;
  userId: string;
}

export const logsQuerySchema = paginationQuerySchema.pick({ page: true, pageSize: true });

const keySelect = {
  id: true,
  name: true,
  prefix: true,
  scopes: true,
  rateLimitPerMinute: true,
  expiresAt: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
  organizationId: true,
  userId: true,
  createdById: true,
} as const;

const present = <K extends { prefix: string }>(key: K) => ({ ...key, displayKey: `pk_${key.prefix}…` });

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private where(owner: KeyOwner) {
    return owner.organizationId ? { organizationId: owner.organizationId } : { organizationId: null, userId: owner.userId };
  }

  async create(req: AppRequest, owner: KeyOwner, grantable: ReadonlySet<string>, dto: z.infer<typeof createApiKeySchema>) {
    const scopes = [...new Set(dto.scopes)];
    const expected = owner.organizationId ? 'ORGANIZATION' : 'PLATFORM';
    for (const s of scopes) {
      if (PERMISSIONS[s as keyof typeof PERMISSIONS]?.scope !== expected) {
        throw new UnprocessableEntityException(`Scope "${s}" is not valid for ${owner.organizationId ? 'organization' : 'personal'} keys`);
      }
      // A key can never be stronger than the person who creates it.
      if (!grantable.has(s)) throw new ForbiddenException(`You cannot grant a scope you do not hold: ${s}`);
    }

    // 8 hex chars of public prefix + 256 bits of secret; only the SHA-256 of the whole key is stored.
    for (let attempt = 0; attempt < 3; attempt++) {
      const prefix = randomBytes(4).toString('hex');
      const raw = `pk_${prefix}.${randomToken(32)}`;
      try {
        const key = await this.db.$transaction(async (tx) => {
          const created = await tx.apiKey.create({
            data: {
              name: dto.name,
              prefix,
              keyHash: sha256(raw),
              scopes,
              rateLimitPerMinute: dto.rateLimitPerMinute,
              expiresAt: dto.expiresInDays ? new Date(Date.now() + dto.expiresInDays * 86_400_000) : null,
              organizationId: owner.organizationId,
              userId: owner.organizationId ? null : owner.userId,
              createdById: owner.userId,
            },
            select: keySelect,
          });
          await this.audit.record(req, { action: 'api_key.created', organizationId: owner.organizationId, entityType: 'api_key', entityId: created.id, metadata: { name: dto.name, scopes } }, tx);
          return created;
        });
        // `secret` is returned exactly once; it cannot be recovered afterwards.
        return { ...present(key), secret: raw };
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error; // prefix collision: pick another
      }
    }
    throw new Error('Could not allocate an API key prefix');
  }

  async list(owner: KeyOwner) {
    const rows = await this.db.apiKey.findMany({ where: this.where(owner), orderBy: { createdAt: 'desc' }, select: keySelect });
    return rows.map(present);
  }

  async revoke(req: AppRequest, owner: KeyOwner, keyId: string) {
    // The owner filter is the IDOR guard: a key id from another organization/user matches nothing.
    const { count } = await this.db.apiKey.updateMany({ where: { id: keyId, ...this.where(owner), revokedAt: null }, data: { revokedAt: new Date() } });
    if (!count) throw new NotFoundException('API key not found');
    await this.audit.record(req, { action: 'api_key.revoked', organizationId: owner.organizationId, entityType: 'api_key', entityId: keyId });
  }

  /** Most recent requests made with a key. */
  async logs(owner: KeyOwner, keyId: string, query: z.infer<typeof logsQuerySchema>) {
    const key = await this.db.apiKey.findFirst({ where: { id: keyId, ...this.where(owner) }, select: { id: true } });
    if (!key) throw new NotFoundException('API key not found');
    const q = { ...query, sort: undefined } as PaginationQuery;
    const [items, total] = await Promise.all([
      this.db.apiLog.findMany({
        where: { apiKeyId: keyId },
        orderBy: parseSort(undefined, ['createdAt'], { field: 'createdAt', dir: 'desc' }),
        ...pageArgs(q),
        select: { id: true, method: true, path: true, statusCode: true, durationMs: true, ip: true, createdAt: true },
      }),
      this.db.apiLog.count({ where: { apiKeyId: keyId } }),
    ]);
    return toPage(items, total, q);
  }
}
