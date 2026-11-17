import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { AppRequest, Principal } from '../../common/principal.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

export interface AuditEntry {
  /** Dotted verb: "user.blocked", "role.created", "api_key.revoked" … */
  action: string;
  organizationId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/** Keys that must never reach the audit trail, wherever they appear in metadata. */
const SECRET_KEY = /token|secret|password|authorization|api[-_]?key|hash/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) ? '[redacted]' : scrub(v, depth + 1)]),
  );
}

@Injectable()
export class AuditService {
  constructor(private readonly db: PrismaService) {}

  /** Writes one audit row. Pass a transaction client as `tx` to make the log atomic with the change. */
  async record(
    req: Pick<AppRequest, 'principal' | 'ip' | 'headers'> | null,
    entry: AuditEntry,
    tx: Prisma.TransactionClient = this.db,
  ) {
    const principal: Principal | undefined = req?.principal;
    await tx.auditLog.create({
      data: {
        action: entry.action,
        organizationId: entry.organizationId ?? null,
        entityType: entry.entityType,
        entityId: entry.entityId,
        actorUserId: principal?.kind === 'user' ? principal.user.id : (principal?.user?.id ?? null),
        actorApiKeyId: principal?.kind === 'apiKey' ? principal.apiKey.id : null,
        ip: req?.ip,
        userAgent: req?.headers['user-agent']?.slice(0, 300),
        metadata: entry.metadata ? (scrub(entry.metadata) as Prisma.InputJsonValue) : undefined,
      },
    });
  }
}
