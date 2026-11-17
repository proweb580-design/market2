import { describe, expect, it } from 'vitest';
import { paginationQuerySchema } from './pagination.js';

describe('paginationQuerySchema', () => {
  it('applies defaults and coerces query strings', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '50', sort: '-createdAt' })).toEqual({
      page: 3,
      pageSize: 50,
      sort: '-createdAt',
    });
  });

  it('rejects oversized pages and injection-shaped sort values', () => {
    expect(paginationQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ sort: 'name; DROP TABLE users' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ sort: 'user.password' }).success).toBe(false);
  });
});
