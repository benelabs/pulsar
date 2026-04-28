import type { z } from 'zod';

import { PulsarValidationError } from '../errors.js';

export function validateToolOutput<T>(
  toolName: string,
  schema: z.ZodSchema<T>,
  output: unknown
): T {
  const parsed = schema.safeParse(output);
  if (!parsed.success) {
    throw new PulsarValidationError(`Invalid output for ${toolName}`, parsed.error.format());
  }
  return parsed.data;
}
