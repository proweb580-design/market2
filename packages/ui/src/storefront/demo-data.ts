import type { GarmentKind, Panel, SizeChart, StoreConfig, StoreProduct } from './types';

/*
 * shortcut: demo catalog for the phase 3 layout only (fictional brand, vector art, no real photos).
 * Phase 8 replaces these functions with API calls of the same shape; nothing here is persisted.
 */

const USD = (dollars: number) => ({ amountMinor: dollars * 100, currency: 'USD' });

const outerwearChart: SizeChart = {
  columns: ['Chest', 'Length', 'Sleeve'],
  rows: [
    { size: 'XS', chestCm: 51, values: ['51 cm', '66 cm', '60 cm'] },
    { size: 'S', chestCm: 54, values: ['54 cm', '68 cm', '62 cm'] },
    { size: 'M', chestCm: 57, values: ['57 cm', '70 cm', '64 cm'] },
    { size: 'L', chestCm: 60, values: ['60 cm', '72 cm', '66 cm'] },
    { size: 'XL', chestCm: 63, values: ['63 cm', '74 cm', '68 cm'] },
    { size: '2XL', chestCm: 66, values: ['66 cm', '76 cm', '70 cm'] },
  ],
};

const teeChart: SizeChart = {
  columns: ['Chest', 'Length', 'Shoulder'],
  rows: [
    { size: 'XS', chestCm: 52, values: ['52 cm', '67 cm', '52 cm'] },
    { size: 'S', chestCm: 55, values: ['55 cm', '69 cm', '54 cm'] },
    { size: 'M', chestCm: 58, values: ['58 cm', '71 cm', '56 cm'] },
    { size: 'L', chestCm: 61, values: ['61 cm', '73 cm', '58 cm'] },
    { size: 'XL', chestCm: 64, values: ['64 cm', '75 cm', '60 cm'] },
  ],
};

const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL'];

function product(
  slug: string,
  title: string,
  kind: GarmentKind,
  color: { name: string; hex: string },
  price: number,
  extra: Partial<StoreProduct> = {},
): StoreProduct {
  const isTee = kind === 'tee';
  return {
    slug,
    title,
    label: 'FW26',
    price: USD(price),
    gender: 'unisex',
    collections: ['fw26', isTee ? 'tops' : 'outerwear'],
    colors: [color],
    sizes: (isTee ? SIZES.slice(0, 5) : SIZES).map((label, i) => ({
      label,
      inStock: (slug.length + i) % 5 !== 0,
    })),
    fabrics: [isTee ? 'Cotton' : kind === 'puffer' ? 'Nylon' : 'Fleece'],
    media: [
      { type: 'art', kind, view: 'front', alt: `${title} — front` },
      { type: 'art', kind, view: 'back', alt: `${title} — back` },
    ],
    description: isTee
      ? ['Heavyweight 280 gsm cotton', 'Boxy fit, dropped shoulder', 'Puff-print graphic', 'Pre-shrunk']
      : [
          'Regular fit',
          'Water-repellent shell',
          'Two-way zip with storm flap',
          'Adjustable hood and hem',
          'Embroidered chest logo',
        ],
    sizeChart: isTee ? teeChart : outerwearChart,
    ...extra,
  };
}

const products: StoreProduct[] = [
  product('quilt-puffer-black', 'Quilt Puffer (Black)', 'puffer', { name: 'Black', hex: '#141414' }, 300),
  product('storm-fleece-ash', 'Storm Fleece (Ash Black)', 'fleece', { name: 'Ash', hex: '#2b2b2d' }, 150, { gender: 'man' }),
  product('storm-fleece-fog', 'Storm Fleece (Fog Grey)', 'fleece', { name: 'Fog', hex: '#b9b7b3' }, 150, { gender: 'woman' }),
  product('heat-shell-graphite', 'Heat Shell (Graphite)', 'puffer', { name: 'Graphite', hex: '#3a3c40' }, 280),
  product('drift-puffer-navy', 'Drift Puffer (Navy)', 'puffer', { name: 'Navy', hex: '#1c2740' }, 320, { gender: 'man' }),
  product('night-hoodie-black', 'Night Hoodie (Black)', 'hoodie', { name: 'Black', hex: '#161616' }, 140),
  product('cloud-hoodie-ice', 'Cloud Hoodie (Ice)', 'hoodie', { name: 'Ice', hex: '#d9dcdf' }, 140, { gender: 'woman' }),
  product('signal-tee-black', 'Signal Tee (Black)', 'tee', { name: 'Black', hex: '#151515' }, 60),
  product('signal-tee-bone', 'Signal Tee (Bone)', 'tee', { name: 'Bone', hex: '#e8e4dc' }, 60, { gender: 'woman' }),
  product('static-tee-grey', 'Static Tee (Grey)', 'tee', { name: 'Grey', hex: '#9a9a9a' }, 55),
  product('mono-tee-black', 'Mono Tee (Black)', 'tee', { name: 'Black', hex: '#101010' }, 50, { gender: 'man' }),
  product('quilt-puffer-stone', 'Quilt Puffer (Stone)', 'puffer', { name: 'Stone', hex: '#8f8a83' }, 300, { gender: 'woman' }),
];

const photo = (from: string, to: string, kind?: GarmentKind, tone?: string, alt = 'Campaign photo'): Panel => ({
  type: 'art',
  from,
  to,
  garment: kind && tone ? { kind, tone } : undefined,
  alt,
});

const store: StoreConfig = {
  slug: 'ashen',
  name: 'Ashen',
  currency: 'USD',
  freeShippingThresholdMinor: 15000,
  hero: {
    eyebrow: 'Outerwear drop 01',
    title: 'FW26',
    subtitle: 'Built for those who move at night',
    panels: [
      photo('#20242b', '#07090c', 'fleece', '#30343a'),
      photo('#1b3a6b', '#0a1424', 'puffer', '#21457f'),
      photo('#5b5d60', '#232426', 'hoodie', '#b8babd'),
    ],
  },
  featured: {
    title: 'Featured',
    subtitle: 'Picked for the season',
    productSlugs: [
      'quilt-puffer-black',
      'storm-fleece-fog',
      'drift-puffer-navy',
      'signal-tee-black',
      'heat-shell-graphite',
      'cloud-hoodie-ice',
    ],
  },
  grid: { title: 'New in', collection: 'fw26' },
  drop: {
    eyebrow: 'Next drop',
    title: 'The Midnight Collection',
    endsAt: '2026-12-12T18:00:00Z',
    panel: photo('#3a1f22', '#0b0b0d', 'puffer', '#5a2a2e'),
  },
  collections: [
    { slug: 'fw26', title: 'FW26', panel: photo('#3b3f46', '#16181b', 'puffer', '#1d1f22') },
    { slug: 'outerwear', title: 'Outerwear', panel: photo('#4d5866', '#1a1f26', 'fleece', '#c9c8c4') },
    { slug: 'tops', title: 'Tops', panel: photo('#6b6660', '#2a2725', 'tee', '#151515') },
    { slug: 'fw26', title: 'Essentials', panel: photo('#25303d', '#0d1116', 'hoodie', '#e1e3e5') },
  ],
  social: {
    handle: '@ashen.studio',
    panels: [
      photo('#8d9097', '#3d4046', 'hoodie', '#e6e6e6'),
      photo('#3c2b33', '#111014', 'tee', '#121212'),
      photo('#1f3f78', '#0b1730', 'puffer', '#2552a0'),
      photo('#2a2d31', '#0c0d0f', 'fleece', '#3a3d42'),
      photo('#44546a', '#151b24', 'puffer', '#22314a'),
    ],
  },
  testimonials: [
    { quote: 'Fits exactly like the size finder said. Warmest jacket I own.', author: 'Mila R.', location: 'Berlin' },
    { quote: 'Shipping took three days and the quality is unreal for the price.', author: 'Daniel K.', location: 'Warsaw' },
    { quote: 'The fleece is heavy in the best way. Already ordered a second colour.', author: 'Aisha T.', location: 'London' },
  ],
  trust: [
    { icon: 'truck', title: 'Free shipping', text: 'On orders over $150' },
    { icon: 'shield', title: 'Secure payment', text: 'Encrypted checkout — shop with confidence' },
    { icon: 'returns', title: 'Easy returns', text: 'Hassle-free returns within 30 days' },
    { icon: 'globe', title: 'Worldwide shipping', text: 'Delivered to your door, wherever you are' },
  ],
  paymentBadges: ['Visa', 'Mastercard', 'Apple Pay', 'Google Pay'],
  playlist: [
    { id: 't1', title: 'Low Lights', artist: 'Ashen Radio', durationSec: 184, cover: photo('#2c3a2e', '#0d120e') },
    { id: 't2', title: 'Night Shift', artist: 'Ashen Radio', durationSec: 201, cover: photo('#3b2c3a', '#120d12') },
    { id: 't3', title: 'Cold Front', artist: 'Ashen Radio', durationSec: 167, cover: photo('#2a3442', '#0b0f15') },
  ],
  lookbook: {
    title: 'Ashen gallery',
    subtitle: 'A visual study of the latest collection',
    items: [
      { id: 'l1', tag: 'FW26', title: 'Platform 4', caption: 'Quilt Puffer, Storm Fleece', ratio: 1.3, panel: photo('#444a52', '#15171a', 'puffer', '#151515') },
      { id: 'l2', tag: 'Campaign', title: 'Underpass', caption: 'Cloud Hoodie', ratio: 1.55, panel: photo('#6e6a66', '#262422', 'hoodie', '#dadcdf') },
      { id: 'l3', tag: 'FW26', title: 'Last train', caption: 'Signal Tee, Drift Puffer', ratio: 1.15, panel: photo('#33435a', '#10151d', 'tee', '#141414') },
      { id: 'l4', tag: 'Editorial', title: 'Concrete', caption: 'Heat Shell', ratio: 1.45, panel: photo('#55585c', '#1b1c1e', 'puffer', '#3a3c40') },
      { id: 'l5', tag: 'SS25', title: 'Roofline', caption: 'Static Tee', ratio: 1.1, panel: photo('#7a7f86', '#2b2e33', 'tee', '#9a9a9a') },
      { id: 'l6', tag: 'Campaign', title: 'Stairwell', caption: 'Night Hoodie', ratio: 1.4, panel: photo('#2e2a33', '#0e0d10', 'hoodie', '#161616') },
      { id: 'l7', tag: 'Editorial', title: 'Blue hour', caption: 'Drift Puffer', ratio: 1.25, panel: photo('#1d3768', '#0a1326', 'puffer', '#1c2740') },
      { id: 'l8', tag: 'SS25', title: 'Courtyard', caption: 'Signal Tee (Bone)', ratio: 1.5, panel: photo('#8a857d', '#35322e', 'tee', '#e8e4dc') },
      { id: 'l9', tag: 'FW26', title: 'Exit 9', caption: 'Storm Fleece (Fog)', ratio: 1.2, panel: photo('#4c4f53', '#18191b', 'fleece', '#b9b7b3') },
    ],
  },
  footer: {
    menu: [
      { label: 'Shop all', path: '/collections/fw26' },
      { label: 'Outerwear', path: '/collections/outerwear' },
      { label: 'Tops', path: '/collections/tops' },
      { label: 'Lookbook', path: '/lookbook' },
    ],
    help: [
      { label: 'Shipping', path: '/pages/shipping' },
      { label: 'Returns', path: '/pages/returns' },
      { label: 'Terms', path: '/pages/terms' },
      { label: 'Privacy', path: '/pages/privacy' },
    ],
    socials: [
      { label: 'Instagram', href: 'https://instagram.com' },
      { label: 'TikTok', href: 'https://tiktok.com' },
      { label: 'Telegram', href: 'https://t.me' },
    ],
  },
};

const collectionTitles: Record<string, string> = { fw26: 'FW26', outerwear: 'Outerwear', tops: 'Tops' };

export async function getStore(slug: string): Promise<StoreConfig | null> {
  return slug === store.slug ? store : null;
}

export async function getProducts(storeSlug: string): Promise<StoreProduct[]> {
  return storeSlug === store.slug ? products : [];
}

export async function getProduct(storeSlug: string, slug: string) {
  return (await getProducts(storeSlug)).find((p) => p.slug === slug) ?? null;
}

export async function getCollection(storeSlug: string, slug: string) {
  const title = collectionTitles[slug];
  if (!title) return null;
  const items = (await getProducts(storeSlug)).filter((p) => p.collections.includes(slug));
  return { slug, title, products: items };
}

export const demoStaticParams = {
  stores: [store.slug],
  products: products.map((p) => p.slug),
  collections: Object.keys(collectionTitles),
};
