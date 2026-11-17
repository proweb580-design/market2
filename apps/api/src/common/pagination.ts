import { BadRequestException } from '@nestjs/common';
import type { Paginated, PaginationQuery } from '@repo/shared';

/**
 * Turns `?sort=-createdAt` into a Prisma `orderBy`, accepting only whitelisted fields
 * (never pass user input straight into orderBy).
 */
export function parseSort<F extends string>(
  sort: string | undefined,
  allowed: readonly F[],
  fallback: { field: F; dir: 'asc' | 'desc' },
): Record<F, 'asc' | 'desc'>[] {
  if (!sort) return [{ [fallback.field]: fallback.dir } as Record<F, 'asc' | 'desc'>];
  const dir = sort.startsWith('-') ? 'desc' : 'asc';
  const field = sort.replace(/^-/, '') as F;
  if (!allowed.includes(field)) {
    throw new BadRequestException(`Cannot sort by "${field}". Allowed: ${allowed.join(', ')}`);
  }
  return [{ [field]: dir } as Record<F, 'asc' | 'desc'>];
}

export const pageArgs = ({ page, pageSize }: PaginationQuery) => ({ skip: (page - 1) * pageSize, take: pageSize });

export const toPage = <T>(items: T[], total: number, { page, pageSize }: PaginationQuery): Paginated<T> => ({
  items,
  page,
  pageSize,
  total,
});
