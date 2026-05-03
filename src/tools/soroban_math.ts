import { SorobanMathInputSchema } from '../schemas/tools.js';
import { PulsarValidationError } from '../errors.js';
import type { McpToolHandler } from '../types.js';
import {
  fixed_add,
  fixed_sub,
  fixed_mul,
  fixed_div,
  compound_interest,
  basis_points_to_percent,
  percent_to_basis_points,
  mean,
  weighted_mean,
  std_dev,
  twap,
  formatHumanReadable,
} from '../utils/math.js';

export const sorobanMath: McpToolHandler<typeof SorobanMathInputSchema> = async (
  input: unknown
) => {
  const parsed = SorobanMathInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PulsarValidationError('Invalid input for soroban_math', parsed.error.format());
  }
  const data = parsed.data;

  try {
    switch (data.operation) {
      case 'fixed_add': {
        const result = fixed_add(BigInt(data.a), BigInt(data.b));
        return {
          operation: 'fixed_add',
          result: result.toString(),
          human_readable: formatHumanReadable(result, data.decimals),
          decimals: data.decimals,
        };
      }
      case 'fixed_sub': {
        const result = fixed_sub(BigInt(data.a), BigInt(data.b));
        return {
          operation: 'fixed_sub',
          result: result.toString(),
          human_readable: formatHumanReadable(result, data.decimals),
          decimals: data.decimals,
        };
      }
      case 'fixed_mul': {
        const result = fixed_mul(BigInt(data.a), BigInt(data.b), data.decimals);
        return {
          operation: 'fixed_mul',
          result: result.toString(),
          human_readable: formatHumanReadable(result, data.decimals),
          decimals: data.decimals,
        };
      }
      case 'fixed_div': {
        const result = fixed_div(BigInt(data.a), BigInt(data.b), data.decimals);
        return {
          operation: 'fixed_div',
          result: result.toString(),
          human_readable: formatHumanReadable(result, data.decimals),
          decimals: data.decimals,
        };
      }
      case 'mean': {
        const result = mean(data.values.map(BigInt), data.decimals);
        return {
          operation: 'mean',
          result: result.toString(),
          human_readable: formatHumanReadable(result, data.decimals),
          decimals: data.decimals,
        };
      }
      case 'weighted_mean': {
        const result = weighted_mean(
          data.values.map(BigInt),
          data.weights.map(BigInt),
          data.decimals
        );
        return {
          operation: 'weighted_mean',
          result: result.toString(),
          human_readable: formatHumanReadable(result, data.decimals),
          decimals: data.decimals,
        };
      }
      case 'std_dev': {
        const result = std_dev(data.values.map(BigInt), data.decimals);
        return {
          operation: 'std_dev',
          result: result.toString(),
          human_readable: formatHumanReadable(result, data.decimals),
          decimals: data.decimals,
        };
      }
      case 'twap': {
        const prices = data.prices.map((p) => ({
          price: BigInt(p.price),
          timestamp: BigInt(p.timestamp),
        }));
        const result = twap(prices, data.decimals);
        return {
          operation: 'twap',
          result: result.toString(),
          human_readable: formatHumanReadable(result, data.decimals),
          decimals: data.decimals,
        };
      }
      case 'compound_interest': {
        const result = compound_interest(
          BigInt(data.principal),
          data.rate_bps,
          data.periods,
          data.compounds_per_period,
          data.decimals
        );
        return {
          operation: 'compound_interest',
          result: result.toString(),
          human_readable: formatHumanReadable(result, data.decimals),
          decimals: data.decimals,
        };
      }
      case 'basis_points_to_percent': {
        const result = basis_points_to_percent(data.value);
        return { operation: 'basis_points_to_percent', result };
      }
      case 'percent_to_basis_points': {
        const result = percent_to_basis_points(data.value);
        return { operation: 'percent_to_basis_points', result };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new PulsarValidationError(message);
  }
};
