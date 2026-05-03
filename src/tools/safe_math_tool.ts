import { SafeMathComputeInputSchema } from '../schemas/tools.js';
import { PulsarValidationError } from '../errors.js';
import type { McpToolHandler } from '../types.js';
import {
  safeAdd,
  safeSub,
  safeMul,
  safeDiv,
  MAX_U32,
  MAX_I32,
  MIN_I32,
  MAX_U64,
  MAX_I64,
  MIN_I64,
  MAX_U128,
  MAX_I128,
  MIN_I128,
} from '../utils/safe_math.js';

/**
 * Tool: safe_math_compute
 * Performs safe integer arithmetic with optional Soroban-compatible bounds checking.
 */
export const safeMathCompute: McpToolHandler<typeof SafeMathComputeInputSchema> = async (
  input: unknown
) => {
  const validatedInput = SafeMathComputeInputSchema.safeParse(input);
  if (!validatedInput.success) {
    throw new PulsarValidationError(
      'Invalid input for safe_math_compute',
      validatedInput.error.format()
    );
  }

  const { a, b, operation, bounds } = validatedInput.data;

  const valA = BigInt(a);
  const valB = BigInt(b);

  let min = MIN_I128;
  let max = MAX_I128;

  switch (bounds) {
    case 'u32':
      min = 0n;
      max = MAX_U32;
      break;
    case 'i32':
      min = MIN_I32;
      max = MAX_I32;
      break;
    case 'u64':
      min = 0n;
      max = MAX_U64;
      break;
    case 'i64':
      min = MIN_I64;
      max = MAX_I64;
      break;
    case 'u128':
      min = 0n;
      max = MAX_U128;
      break;
    case 'i128':
      min = MIN_I128;
      max = MAX_I128;
      break;
    case 'none':
      // Use very large bounds for 'none' to allow BigInt flexibility
      min = -(2n ** 256n);
      max = 2n ** 256n;
      break;
  }

  let mathResult: bigint;
  switch (operation) {
    case 'add':
      mathResult = safeAdd(valA, valB, min, max);
      break;
    case 'sub':
      mathResult = safeSub(valA, valB, min, max);
      break;
    case 'mul':
      mathResult = safeMul(valA, valB, min, max);
      break;
    case 'div':
      mathResult = safeDiv(valA, valB, min, max);
      break;
  }

  return {
    bounds,
    formatted: `Result of ${a} ${operation} ${b} is ${mathResult.toString()} (within ${bounds} bounds)`,
    operation,
    result: mathResult.toString(),
  };
};
