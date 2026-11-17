import { applyDecorators, BadRequestException, type PipeTransform } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';

/** Validates and transforms a body/query/param with a Zod schema; unknown keys are rejected by `.strict()` schemas. */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}

type Json = Record<string, unknown>;
const toJson = (schema: z.ZodType): Json => z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Json;

/** Swagger body docs generated from the same Zod schema the pipe validates with. */
export const ApiZodBody = (schema: z.ZodType) => ApiBody({ schema: toJson(schema) });

/** Swagger query docs: one parameter per top-level property. */
export function ApiZodQuery(schema: z.ZodType) {
  const json = toJson(schema);
  const props = (json.properties ?? {}) as Record<string, Json>;
  const required = new Set((json.required ?? []) as string[]);
  return applyDecorators(
    ...Object.entries(props).map(([name, def]) => ApiQuery({ name, required: required.has(name), schema: def })),
  );
}
