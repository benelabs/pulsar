const scale = (decimals: number): bigint => 10n ** BigInt(decimals);

function isqrt(n: bigint): bigint {
  if (n === 0n) return 0n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

function bigintPow(base: bigint, exp: bigint): bigint {
  if (exp === 0n) return 1n;
  let result = 1n;
  let b = base;
  let e = exp;
  while (e > 0n) {
    if (e % 2n === 1n) result *= b;
    b *= b;
    e /= 2n;
  }
  return result;
}

export function fixed_add(a: bigint, b: bigint): bigint {
  return a + b;
}

export function fixed_sub(a: bigint, b: bigint): bigint {
  return a - b;
}

export function fixed_mul(a: bigint, b: bigint, decimals: number): bigint {
  return (a * b) / scale(decimals);
}

export function fixed_div(a: bigint, b: bigint, decimals: number): bigint {
  if (b === 0n) throw new Error('Division by zero');
  return (a * scale(decimals)) / b;
}

export function compound_interest(
  principal: bigint,
  rate_bps: number,
  periods: number,
  compounds_per_period: number,
  _decimals: number
): bigint {
  const num = BigInt(10000 * compounds_per_period + rate_bps);
  const den = BigInt(10000 * compounds_per_period);
  const n = BigInt(periods * compounds_per_period);
  return (principal * bigintPow(num, n)) / bigintPow(den, n);
}

export function basis_points_to_percent(bps: number): number {
  return bps / 100;
}

export function percent_to_basis_points(pct: number): number {
  return Math.round(pct * 100);
}

export function mean(values: bigint[], _decimals: number): bigint {
  const sum = values.reduce((acc, v) => acc + v, 0n);
  return sum / BigInt(values.length);
}

export function weighted_mean(values: bigint[], weights: bigint[], _decimals: number): bigint {
  if (values.length !== weights.length) {
    throw new Error('Values and weights arrays must have the same length');
  }
  for (const w of weights) {
    if (w < 0n) throw new Error('Weights must be non-negative');
  }
  const weightSum = weights.reduce((acc, w) => acc + w, 0n);
  if (weightSum === 0n) throw new Error('Sum of weights must be non-zero');
  const weightedSum = values.reduce((acc, v, i) => acc + v * weights[i], 0n);
  return weightedSum / weightSum;
}

export function std_dev(values: bigint[], _decimals: number): bigint {
  const avg = mean(values, _decimals);
  const variance_S2 =
    values.reduce((acc, v) => {
      const diff = v - avg;
      return acc + diff * diff;
    }, 0n) / BigInt(values.length);
  return isqrt(variance_S2);
}

export function twap(prices: { price: bigint; timestamp: bigint }[], _decimals: number): bigint {
  const totalTime = prices[prices.length - 1].timestamp - prices[0].timestamp;
  if (totalTime === 0n) throw new Error('Total time span must be non-zero');
  let weightedSum = 0n;
  for (let i = 0; i < prices.length - 1; i++) {
    const dt = prices[i + 1].timestamp - prices[i].timestamp;
    weightedSum += prices[i].price * dt;
  }
  return weightedSum / totalTime;
}

export function formatHumanReadable(value: bigint, decimals: number): string {
  const S = scale(decimals);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const intPart = abs / S;
  const fracPart = abs % S;
  const fracStr = fracPart.toString().padStart(decimals, '0');
  const formatted = decimals > 0 ? `${intPart}.${fracStr}` : `${intPart}`;
  return negative ? `-${formatted}` : formatted;
}
