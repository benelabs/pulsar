import { describe, it, expect } from "vitest";

import { computeVestingSchedule } from "../../src/tools/compute_vesting_schedule.js";

describe("computeVestingSchedule", () => {
  const BASE_TIME = 1700000000; // Fixed start timestamp for deterministic tests

  it("returns zero released amount before cliff", async () => {
    const result = (await computeVestingSchedule({
      total_amount: 1000000,
      start_timestamp: BASE_TIME,
      cliff_seconds: 31536000, // 1 year
      vesting_duration_seconds: 126230400, // 4 years
      release_frequency_seconds: 2592000, // monthly
      beneficiary_type: "team",
      current_timestamp: BASE_TIME + 1000, // 1000 seconds after start
    })) as any;

    expect(result.beneficiary_type).toBe("team");
    expect(result.total_amount).toBe("1000000.0000000");
    expect(result.released_amount).toBe("0.0000000");
    expect(result.unreleased_amount).toBe("1000000.0000000");
    expect(result.vesting_percentage).toBe(0);
    expect(result.schedule[0].released).toBe(false);
  });

  it("returns partial release after cliff and some periods", async () => {
    const result = (await computeVestingSchedule({
      total_amount: 1000000,
      start_timestamp: BASE_TIME,
      cliff_seconds: 31536000, // 1 year
      vesting_duration_seconds: 126230400, // 4 years
      release_frequency_seconds: 2592000, // monthly
      beneficiary_type: "investor",
      current_timestamp: BASE_TIME + 31536000 + 5184000, // 1 year + 2 months
    })) as any;

    expect(result.released_amount).toBe("66666.6666666");
    expect(result.unreleased_amount).toBe("933333.3333334");
    expect(result.vesting_percentage).toBe(6.67);
    expect(result.schedule[0].released).toBe(true);
    expect(result.schedule[1].released).toBe(true);
    expect(result.schedule[2].released).toBe(false);
  });

  it("returns full release after vesting period ends", async () => {
    const result = (await computeVestingSchedule({
      total_amount: 500000,
      start_timestamp: BASE_TIME,
      cliff_seconds: 0,
      vesting_duration_seconds: 86400, // 1 day
      release_frequency_seconds: 3600, // hourly
      beneficiary_type: "advisor",
      current_timestamp: BASE_TIME + 100000,
    })) as any;

    expect(result.released_amount).toBe("500000.0000000");
    expect(result.unreleased_amount).toBe("0.0000000");
    expect(result.vesting_percentage).toBe(100);
    expect(result.next_release_date).toBeUndefined();
    expect(result.schedule.every((s: any) => s.released)).toBe(true);
  });

  it("returns correct schedule with no cliff", async () => {
    const result = (await computeVestingSchedule({
      total_amount: 1200,
      start_timestamp: BASE_TIME,
      cliff_seconds: 0,
      vesting_duration_seconds: 120, // 2 minutes
      release_frequency_seconds: 30, // every 30 seconds
      beneficiary_type: "other",
      current_timestamp: BASE_TIME + 45,
    })) as any;

    expect(result.schedule).toHaveLength(4);
    expect(result.released_amount).toBe("300.0000000");
    expect(result.unreleased_amount).toBe("900.0000000");
    expect(result.vesting_percentage).toBe(25);
  });

  it("validates cliff is less than vesting duration", async () => {
    await expect(
      computeVestingSchedule({
        total_amount: 1000,
        start_timestamp: BASE_TIME,
        cliff_seconds: 100,
        vesting_duration_seconds: 100,
        release_frequency_seconds: 10,
        beneficiary_type: "team",
        current_timestamp: BASE_TIME,
      })
    ).rejects.toThrow("cliff_seconds must be less than vesting_duration_seconds");
  });

  it("validates release frequency does not exceed vesting duration", async () => {
    await expect(
      computeVestingSchedule({
        total_amount: 1000,
        start_timestamp: BASE_TIME,
        cliff_seconds: 0,
        vesting_duration_seconds: 100,
        release_frequency_seconds: 200,
        beneficiary_type: "team",
        current_timestamp: BASE_TIME,
      })
    ).rejects.toThrow("release_frequency_seconds must not exceed vesting_duration_seconds");
  });

  it("computes correct dates in output", async () => {
    const result = (await computeVestingSchedule({
      total_amount: 10000,
      start_timestamp: BASE_TIME,
      cliff_seconds: 3600,
      vesting_duration_seconds: 86400,
      release_frequency_seconds: 21600, // every 6 hours
      beneficiary_type: "investor",
      current_timestamp: BASE_TIME,
    })) as any;

    expect(result.start_date).toBe(new Date(BASE_TIME * 1000).toISOString());
    expect(result.cliff_date).toBe(new Date((BASE_TIME + 3600) * 1000).toISOString());
    expect(result.end_date).toBe(new Date((BASE_TIME + 86400) * 1000).toISOString());
  });

  it("sets next_release_date to first unreleased period", async () => {
    const result = (await computeVestingSchedule({
      total_amount: 1000,
      start_timestamp: BASE_TIME,
      cliff_seconds: 0,
      vesting_duration_seconds: 100,
      release_frequency_seconds: 25,
      beneficiary_type: "team",
      current_timestamp: BASE_TIME + 30,
    })) as any;

    expect(result.next_release_date).toBe(result.schedule[1].release_date);
  });

  it("adjusts last period for rounding errors", async () => {
    const result = (await computeVestingSchedule({
      total_amount: 1000,
      start_timestamp: BASE_TIME,
      cliff_seconds: 0,
      vesting_duration_seconds: 300,
      release_frequency_seconds: 100,
      beneficiary_type: "team",
      current_timestamp: BASE_TIME + 500,
    })) as any;

    const sum = result.schedule.reduce((acc: number, s: any) => acc + parseFloat(s.amount), 0);
    expect(sum).toBeCloseTo(1000, 5);
  });
});
