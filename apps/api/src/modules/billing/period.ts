/** Adds whole billing intervals in UTC, clamping the day (Jan 31 + 1 month = Feb 28/29). */
export function addInterval(from: Date, interval: 'MONTH' | 'YEAR', times = 1): Date {
  const months = (interval === 'YEAR' ? 12 : 1) * times;
  const day = from.getUTCDate();
  const target = new Date(from);
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

export const addDays = (from: Date, days: number) => new Date(from.getTime() + days * 86_400_000);

/** Live subscriptions grant access; CANCELED/EXPIRED rows are history. */
export const LIVE_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE'] as const;

/** A PAST_DUE subscription keeps its features this long after the period ended. */
export const GRACE_DAYS = 3;

/** The Free plan never expires; a far-future end keeps the period CHECK constraint simple. */
export const FREE_PERIOD_YEARS = 100;
