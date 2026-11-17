import { describe, expect, it } from 'vitest';
import { fitFinderSchema, recommendSize, type SizeChartRow } from './sizing.js';

const chart: SizeChartRow[] = [
  { size: 'L', chestCm: 59 },
  { size: 'S', chestCm: 53 },
  { size: 'XL', chestCm: 62 },
  { size: 'M', chestCm: 56 },
];

describe('recommendSize', () => {
  it('picks the smallest size that leaves the requested ease', () => {
    const base = { heightCm: 175, weightKg: 70, bodyType: 'regular' } as const;
    expect(recommendSize({ ...base, fit: 'regular' }, chart)).toEqual({ size: 'M', fits: true });
    expect(recommendSize({ ...base, fit: 'oversized' }, chart)).toEqual({ size: 'XL', fits: true });
    expect(
      recommendSize({ heightCm: 165, weightKg: 55, bodyType: 'slim', fit: 'fitted' }, chart),
    ).toEqual({ size: 'S', fits: true });
  });

  it('falls back to the largest size and says it does not fit', () => {
    expect(
      recommendSize({ heightCm: 190, weightKg: 100, bodyType: 'broad', fit: 'regular' }, chart),
    ).toEqual({ size: 'XL', fits: false });
  });

  it('returns null without a size chart', () => {
    expect(
      recommendSize({ heightCm: 175, weightKg: 70, bodyType: 'regular', fit: 'regular' }, []),
    ).toBeNull();
  });
});

describe('fitFinderSchema', () => {
  it('coerces form strings and rejects implausible values', () => {
    expect(
      fitFinderSchema.parse({ heightCm: '180', weightKg: '75', bodyType: 'slim', fit: 'fitted' }),
    ).toEqual({ heightCm: 180, weightKg: 75, bodyType: 'slim', fit: 'fitted' });
    expect(
      fitFinderSchema.safeParse({ heightCm: '30', weightKg: '75', bodyType: 'slim', fit: 'fitted' })
        .success,
    ).toBe(false);
  });
});
