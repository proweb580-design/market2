/**
 * Plan feature catalogue. `limit` features store a number in plan_features.limit_value (null = unlimited);
 * `flag` features are on/off. The SubscriptionGuard (phase 6) only understands keys listed here.
 */
export const PLAN_FEATURES = {
  'products.max': { kind: 'limit', description: 'Products in the catalogue' },
  'members.max': { kind: 'limit', description: 'Team members (users) in the organization' },
  'storage.mb': { kind: 'limit', description: 'Media storage, MB' },
  'api.requests_per_day': { kind: 'limit', description: 'REST API requests per day' },
  api_access: { kind: 'flag', description: 'REST API and API keys' },
  telegram_mini_app: { kind: 'flag', description: 'Storefront inside Telegram' },
  custom_domain: { kind: 'flag', description: 'Own domain for the storefront' },
  lookbook: { kind: 'flag', description: 'Lookbook gallery' },
  music_player: { kind: 'flag', description: 'Storefront music player' },
  drop_countdown: { kind: 'flag', description: 'Drop countdown banner' },
  remove_branding: { kind: 'flag', description: 'Hide “Powered by” platform branding' },
} as const satisfies Record<string, { kind: 'limit' | 'flag'; description: string }>;

export type PlanFeatureKey = keyof typeof PLAN_FEATURES;

type FeatureValues = Partial<Record<PlanFeatureKey, boolean | number | null>>;

/**
 * Default plans created by the seed. Prices and limits are placeholders until the business sets them —
 * they are edited in the admin panel afterwards; the seed never overwrites existing plans.
 */
export const DEFAULT_PLANS: {
  code: string;
  name: string;
  priceMinor: number;
  currency: string;
  interval: 'MONTH' | 'YEAR';
  trialDays: number;
  isPublic: boolean;
  features: FeatureValues;
}[] = [
  {
    code: 'FREE',
    name: 'Free',
    priceMinor: 0,
    currency: 'USD',
    interval: 'MONTH',
    trialDays: 0,
    isPublic: true,
    features: { 'products.max': 10, 'members.max': 1, 'storage.mb': 100 },
  },
  {
    code: 'BASIC',
    name: 'Basic',
    priceMinor: 1900,
    currency: 'USD',
    interval: 'MONTH',
    trialDays: 14,
    isPublic: true,
    features: { 'products.max': 100, 'members.max': 3, 'storage.mb': 1024, telegram_mini_app: true, lookbook: true },
  },
  {
    code: 'PRO',
    name: 'Pro',
    priceMinor: 4900,
    currency: 'USD',
    interval: 'MONTH',
    trialDays: 14,
    isPublic: true,
    features: {
      'products.max': 1000,
      'members.max': 10,
      'storage.mb': 10240,
      'api.requests_per_day': 10000,
      api_access: true,
      telegram_mini_app: true,
      custom_domain: true,
      lookbook: true,
      music_player: true,
      drop_countdown: true,
    },
  },
  {
    code: 'BUSINESS',
    name: 'Business',
    priceMinor: 14900,
    currency: 'USD',
    interval: 'MONTH',
    trialDays: 14,
    isPublic: true,
    features: {
      'products.max': 10000,
      'members.max': 50,
      'storage.mb': 102400,
      'api.requests_per_day': 100000,
      api_access: true,
      telegram_mini_app: true,
      custom_domain: true,
      lookbook: true,
      music_player: true,
      drop_countdown: true,
      remove_branding: true,
    },
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    priceMinor: 0,
    currency: 'USD',
    interval: 'YEAR',
    trialDays: 0,
    isPublic: false,
    // null limit = unlimited; contract terms are agreed individually.
    features: {
      'products.max': null,
      'members.max': null,
      'storage.mb': null,
      'api.requests_per_day': null,
      api_access: true,
      telegram_mini_app: true,
      custom_domain: true,
      lookbook: true,
      music_player: true,
      drop_countdown: true,
      remove_branding: true,
    },
  },
];
