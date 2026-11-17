import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;

/**
 * Query contract for every list endpoint: `?page=2&pageSize=50&sort=-createdAt`.
 * `sort` only checks the shape; each endpoint must still whitelist sortable fields.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
  sort: z
    .string()
    .regex(/^-?[a-zA-Z][a-zA-Z0-9]*$/)
    .optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
