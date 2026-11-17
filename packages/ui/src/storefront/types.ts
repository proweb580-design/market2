import type { SizeChartRow } from '@repo/shared';

/**
 * View models for the storefront UI. Phase 8 maps API DTOs onto these;
 * until then they are filled from `demo-data.ts`.
 */

export type GarmentKind = 'puffer' | 'hoodie' | 'fleece' | 'tee';

/** Real uploaded image, or vector demo art (until brands upload media). */
export type Media =
  | { type: 'image'; src: string; alt: string }
  | { type: 'art'; kind: GarmentKind; view: 'front' | 'back'; alt: string };

/** Editorial photo slot (banner, lookbook, collections). */
export type Panel =
  | { type: 'image'; src: string; alt: string }
  | { type: 'art'; from: string; to: string; garment?: { kind: GarmentKind; tone: string }; alt: string };

export interface Money {
  amountMinor: number;
  currency: string;
}

export interface ProductColor {
  name: string;
  hex: string;
}

export interface SizeChart {
  columns: string[];
  rows: (SizeChartRow & { values: string[] })[];
}

export interface StoreProduct {
  slug: string;
  title: string;
  label?: string;
  price: Money;
  gender: 'woman' | 'man' | 'unisex';
  collections: string[];
  colors: ProductColor[];
  sizes: { label: string; inStock: boolean }[];
  fabrics: string[];
  media: Media[];
  description: string[];
  sizeChart?: SizeChart;
}

export interface CollectionInfo {
  slug: string;
  title: string;
  panel: Panel;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  cover: Panel;
  src?: string;
}

export interface LookbookItem {
  id: string;
  tag: string;
  title: string;
  caption: string;
  panel: Panel;
  ratio: number;
}

export interface StoreConfig {
  slug: string;
  name: string;
  currency: string;
  freeShippingThresholdMinor: number;
  hero: { eyebrow: string; title: string; subtitle: string; panels: Panel[] };
  featured: { title: string; subtitle: string; productSlugs: string[] };
  grid: { title: string; collection: string };
  drop: { eyebrow: string; title: string; endsAt: string; panel: Panel };
  collections: CollectionInfo[];
  social: { handle: string; panels: Panel[] };
  testimonials: { quote: string; author: string; location: string }[];
  trust: { icon: 'truck' | 'shield' | 'returns' | 'globe'; title: string; text: string }[];
  /** Payment methods the brand's provider accepts, shown as text badges. */
  paymentBadges: string[];
  playlist: Track[];
  lookbook: { title: string; subtitle: string; items: LookbookItem[] };
  footer: {
    menu: { label: string; path: string }[];
    help: { label: string; path: string }[];
    socials: { label: string; href: string }[];
  };
}
