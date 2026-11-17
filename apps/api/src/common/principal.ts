import type { Request } from 'express';
import type { UserStatus } from '../generated/prisma/enums.js';

export interface AuthUser {
  id: string;
  email: string | null;
  status: UserStatus;
}

export interface ApiKeyInfo {
  id: string;
  /** Set for organization keys. */
  organizationId: string | null;
  /** Set for personal keys (and informational on organization keys). */
  userId: string | null;
  scopes: readonly string[];
}

/** Who is calling, established by AuthGuard from a verified token or API key — never from request data. */
export type Principal =
  | { kind: 'user'; user: AuthUser; sessionId?: string }
  | { kind: 'apiKey'; apiKey: ApiKeyInfo; user?: AuthUser };

export interface Tenant {
  organizationId: string;
  memberId: string | null;
  roleKey: string | null;
  permissions: ReadonlySet<string>;
  /** True when a SUPER_ADMIN reaches into an organization they are not a member of. */
  viaSuperAdmin: boolean;
}

export interface PlatformAccess {
  permissions: ReadonlySet<string>;
  roleKeys: readonly string[];
  isSuperAdmin: boolean;
}

export interface AppRequest extends Request {
  requestId?: string;
  principal?: Principal;
  tenant?: Tenant;
  platformAccess?: PlatformAccess;
}
