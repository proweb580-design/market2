/**
 * Permission catalogue — single source for the DB seed, server guards and admin UI.
 * Keys are `<area>.<resource>.<action>` (platform) or `<resource>.<action>` (organization).
 * Adding a key here + re-running the seed is enough to make it assignable to roles.
 */
export const PERMISSIONS = {
  // Platform scope — checked against the user's platform roles.
  'platform.stats.read': { scope: 'PLATFORM', description: 'View platform statistics' },
  'platform.users.read': { scope: 'PLATFORM', description: 'View users' },
  'platform.users.manage': { scope: 'PLATFORM', description: 'Block, unblock and delete users' },
  'platform.roles.manage': { scope: 'PLATFORM', description: 'Create, edit, delete and assign roles' },
  'platform.organizations.read': { scope: 'PLATFORM', description: 'View organizations' },
  'platform.organizations.manage': { scope: 'PLATFORM', description: 'Suspend and edit organizations' },
  'platform.plans.manage': { scope: 'PLATFORM', description: 'Create and edit plans and plan features' },
  'platform.subscriptions.read': { scope: 'PLATFORM', description: 'View subscriptions' },
  'platform.subscriptions.manage': { scope: 'PLATFORM', description: 'Change, extend and cancel subscriptions' },
  'platform.payments.read': { scope: 'PLATFORM', description: 'View payments and transactions' },
  'platform.payments.refund': { scope: 'PLATFORM', description: 'Refund payments' },
  'platform.api_keys.read': { scope: 'PLATFORM', description: 'View all API keys and their logs' },
  'platform.api_keys.manage': { scope: 'PLATFORM', description: 'Revoke any API key' },
  'platform.audit.read': { scope: 'PLATFORM', description: 'View audit logs and system events' },
  'platform.settings.manage': { scope: 'PLATFORM', description: 'Change platform settings' },

  // Organization scope — checked against the member's role inside the organization in the route.
  'org.settings.manage': { scope: 'ORGANIZATION', description: 'Edit store settings and branding' },
  'org.members.read': { scope: 'ORGANIZATION', description: 'View team members' },
  'org.members.manage': { scope: 'ORGANIZATION', description: 'Invite, remove and re-assign members' },
  'org.roles.manage': { scope: 'ORGANIZATION', description: 'Create and edit custom organization roles' },
  'org.billing.read': { scope: 'ORGANIZATION', description: 'View plan, invoices and payments' },
  'org.billing.manage': { scope: 'ORGANIZATION', description: 'Change plan and payment settings' },
  'org.api_keys.manage': { scope: 'ORGANIZATION', description: 'Create and revoke organization API keys' },
  'org.audit.read': { scope: 'ORGANIZATION', description: 'View the organization audit log' },
  'org.integrations.manage': { scope: 'ORGANIZATION', description: 'Connect Telegram bot and payment provider' },
  'catalog.read': { scope: 'ORGANIZATION', description: 'View products and collections' },
  'catalog.write': { scope: 'ORGANIZATION', description: 'Create and edit products, collections, media' },
  'orders.read': { scope: 'ORGANIZATION', description: 'View orders and customers' },
  'orders.manage': { scope: 'ORGANIZATION', description: 'Fulfil, cancel and refund orders' },
  'content.write': { scope: 'ORGANIZATION', description: 'Edit home page, lookbook, playlist, reviews' },
} as const satisfies Record<string, { scope: 'PLATFORM' | 'ORGANIZATION'; description: string }>;

export type PermissionKey = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

const scoped = (scope: 'PLATFORM' | 'ORGANIZATION') =>
  PERMISSION_KEYS.filter((k) => PERMISSIONS[k].scope === scope);
const except = (keys: PermissionKey[], ...drop: PermissionKey[]) => keys.filter((k) => !drop.includes(k));

const platformAll = scoped('PLATFORM');
const orgAll = scoped('ORGANIZATION');

/** System roles created by the seed. Brands can add custom organization roles on top. */
export const SYSTEM_ROLE_DEFINITIONS = [
  { key: 'SUPER_ADMIN', scope: 'PLATFORM', name: 'Super admin', permissions: platformAll },
  { key: 'ADMIN', scope: 'PLATFORM', name: 'Admin', permissions: except(platformAll, 'platform.roles.manage', 'platform.settings.manage') },
  {
    key: 'MANAGER',
    scope: 'PLATFORM',
    name: 'Support manager',
    permissions: platformAll.filter((k) => k.endsWith('.read')),
  },
  { key: 'USER', scope: 'PLATFORM', name: 'User', permissions: [] },
  { key: 'API_CLIENT', scope: 'PLATFORM', name: 'API client', permissions: [] },

  { key: 'ORG_OWNER', scope: 'ORGANIZATION', name: 'Owner', permissions: orgAll },
  { key: 'ORG_ADMIN', scope: 'ORGANIZATION', name: 'Admin', permissions: except(orgAll, 'org.billing.manage') },
  {
    key: 'ORG_MANAGER',
    scope: 'ORGANIZATION',
    name: 'Manager',
    permissions: ['catalog.read', 'catalog.write', 'orders.read', 'orders.manage', 'content.write', 'org.members.read'],
  },
  { key: 'ORG_STAFF', scope: 'ORGANIZATION', name: 'Staff', permissions: ['catalog.read', 'orders.read', 'orders.manage'] },
] as const satisfies readonly {
  key: string;
  scope: 'PLATFORM' | 'ORGANIZATION';
  name: string;
  permissions: readonly PermissionKey[];
}[];
