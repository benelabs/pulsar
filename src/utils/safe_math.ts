import { PulsarMathError } from '../errors.js';

/**
 * Safe Math Utilities for Pulsar.
 * Provides overflow/underflow protection for BigInt operations,
 * mimicking Soroban's checked arithmetic.
 */

export const MAX_U32 = BigInt('4294967295');
export const MAX_I32 = BigInt('2147483647');
export const MIN_I32 = BigInt('-2147483648');

export const MAX_U64 = BigInt('18446744073709551615');
export const MAX_I64 = BigInt('9223372036854775807');
export const MIN_I64 = BigInt('-9223372036854775808');

export const MAX_U128 = BigInt('340282366920938463463374607431768211455');
export const MAX_I128 = BigInt('170141183460469231731687303715884105727');
export const MIN_I128 = BigInt('-170141183460469231731687303715884105728');

/**
 * Ensures a BigInt value is within the specified bounds.
 */
export function checkBounds(value: bigint, min: bigint, max: bigint, label: string = 'Value') {
  if (value < min) {
    throw new PulsarMathError(`${label} underflow: value ${value} is below minimum ${min}`);
  }
  if (value > max) {
    throw new PulsarMathError(`${label} overflow: value ${value} is above maximum ${max}`);
  }
  return value;
}

/**
 * Safe addition with bounds checking.
 */
export function safeAdd(
  a: bigint,
  b: bigint,
  min: bigint = MIN_I128,
  max: bigint = MAX_I128
): bigint {
  const result = a + b;
  return checkBounds(result, min, max, 'Addition');
}

/**
 * Safe subtraction with bounds checking.
 */
export function safeSub(
  a: bigint,
  b: bigint,
  min: bigint = MIN_I128,
  max: bigint = MAX_I128
): bigint {
  const result = a - b;
  return checkBounds(result, min, max, 'Subtraction');
}

/**
 * Safe multiplication with bounds checking.
 */
export function safeMul(
  a: bigint,
  b: bigint,
  min: bigint = MIN_I128,
  max: bigint = MAX_I128
): bigint {
  const result = a * b;
  return checkBounds(result, min, max, 'Multiplication');
}

/**
 * Safe division with bounds checking and zero-division protection.
 */
export function safeDiv(
  a: bigint,
  b: bigint,
  min: bigint = MIN_I128,
  max: bigint = MAX_I128
): bigint {
  if (b === 0n) {
    throw new PulsarMathError('Division by zero');
  }
  const result = a / b;
  return checkBounds(result, min, max, 'Division');
}

/**
 * Converts a number to BigInt with optional precision (e.g., for stroops).
 * 1.0 XLM = 10,000,000 stroops (7 decimal places).
 */
export function toStroops(amount: number): bigint {
  // Use string conversion to avoid float precision issues before BigInt conversion
  const fixed = amount.toFixed(7);
  const parts = fixed.split('.');
  const integerPart = BigInt(parts[0]);
  const fractionalPart = BigInt(parts[1]);
  return integerPart * 10000000n + fractionalPart;
}

/**
 * Converts stroops (BigInt) back to a number (XLM).
 */
export function fromStroops(stroops: bigint): number {
  return Number(stroops) / 10000000;
}
