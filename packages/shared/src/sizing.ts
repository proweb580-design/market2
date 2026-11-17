import { z } from 'zod';

export const BODY_TYPES = ['slim', 'regular', 'broad'] as const;
export const FIT_PREFERENCES = ['fitted', 'regular', 'oversized'] as const;

export const fitFinderSchema = z.object({
  heightCm: z.coerce.number().int().min(140).max(220),
  weightKg: z.coerce.number().int().min(35).max(200),
  bodyType: z.enum(BODY_TYPES),
  fit: z.enum(FIT_PREFERENCES),
});

export type FitFinderInput = z.infer<typeof fitFinderSchema>;

/** One row of a garment size chart. `chestCm` is the flat (half) chest width, as printed on most charts. */
export interface SizeChartRow {
  size: string;
  chestCm: number;
}

export interface SizeRecommendation {
  size: string;
  /** false when even the largest size is tighter than the requested fit. */
  fits: boolean;
}

const BODY_ADJUST_CM = { slim: -3, regular: 0, broad: 4 } as const;
const EASE_CM = { fitted: 6, regular: 12, oversized: 20 } as const;

/**
 * shortcut: rough anthropometric heuristic (architecture assumption D6) — body chest girth from
 * height/weight, plus wearing ease per fit. Replace with brand-specific fit data when available.
 */
export function recommendSize(
  input: FitFinderInput,
  chart: readonly SizeChartRow[],
): SizeRecommendation | null {
  if (chart.length === 0) return null;
  const bodyGirth =
    50 + 0.45 * input.weightKg + 0.1 * input.heightCm + BODY_ADJUST_CM[input.bodyType];
  const needed = bodyGirth + EASE_CM[input.fit];
  const rows = [...chart].sort((a, b) => a.chestCm - b.chestCm);
  const match = rows.find((row) => row.chestCm * 2 >= needed);
  return match ? { size: match.size, fits: true } : { size: rows.at(-1)!.size, fits: false };
}
