import { expect, it, describe } from 'vitest';

import { computeVestingSchedule } from '../../src/tools/compute_vesting_schedule.js';

/**
 * Integration tests for compute_vesting_schedule tool.
 *
 * These exercise the full computation pipeline with real timestamps.
 * No network calls are required — the tool is pure computation.
 */

describe('compute_vesting_schedule (Integration)', () => {
  it('computes a realistic 4-year team vesting schedule', async () => {
    const now = Math.floor(Date.now() / 1000);
    const start = now - 31536000 * 2; // 2 years ago

    const result = (await computeVestingSchedule({
      total_amount: 10000000,
      start_timestamp: start,
      cliff_seconds: 31536000, // 1 year cliff
      vesting_duration_seconds: 126230400, // 4 years total
      release_frequency_seconds: 2592000, // monthly
      beneficiary_type: 'team',
    })) as any;

    expect(result.beneficiary_type).toBe('team');
    expect(parseFloat(result.total_amount)).toBe(10000000);
    expect(parseFloat(result.released_amount)).toBeGreaterThan(0);
    expect(parseFloat(result.unreleased_amount)).toBeGreaterThan(0);
    expect(result.vesting_percentage).toBeGreaterThan(0);
    expect(result.vesting_percentage).toBeLessThanOrEqual(100);
    expect(result.schedule.length).toBeGreaterThan(0);
    expect(result.next_release_date).toBeDefined();
  });

  it('computes a full investor vesting schedule at completion', async () => {
    const now = Math.floor(Date.now() / 1000);
    const start = now - 86400 * 400; // ~400 days ago

    const result = (await computeVestingSchedule({
      total_amount: 5000000,
      start_timestamp: start,
      cliff_seconds: 0,
      vesting_duration_seconds: 86400 * 365, // 1 year
      release_frequency_seconds: 86400 * 30, // monthly
      beneficiary_type: 'investor',
    })) as any;

    expect(parseFloat(result.released_amount)).toBe(5000000);
    expect(parseFloat(result.unreleased_amount)).toBe(0);
    expect(result.vesting_percentage).toBe(100);
    expect(result.next_release_date).toBeUndefined();
    expect(result.schedule.every((s: any) => s.released)).toBe(true);
  });

  it('computes an advisor schedule before any tokens unlock', async () => {
    const now = Math.floor(Date.now() / 1000);
    const start = now + 86400; // starts tomorrow

    const result = (await computeVestingSchedule({
      total_amount: 2500000,
      start_timestamp: start,
      cliff_seconds: 15778800, // ~6 months
      vesting_duration_seconds: 63115200, // 2 years
      release_frequency_seconds: 2592000, // monthly
      beneficiary_type: 'advisor',
    })) as any;

    expect(parseFloat(result.released_amount)).toBe(0);
    expect(parseFloat(result.unreleased_amount)).toBe(2500000);
    expect(result.vesting_percentage).toBe(0);
    expect(result.schedule[0].released).toBe(false);
  });
});
