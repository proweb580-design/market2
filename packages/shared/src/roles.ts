/** Platform-level system roles. Organization roles live in the DB (system + custom per brand). */
export const SYSTEM_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER', 'API_CLIENT'] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];
