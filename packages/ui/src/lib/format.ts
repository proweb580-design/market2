import type { Money } from '../storefront/types';

export function formatMoney({ amountMinor, currency }: Money, locale = 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountMinor / 100);
}

export function formatDuration(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
