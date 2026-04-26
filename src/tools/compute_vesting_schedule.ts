import {
  ComputeVestingScheduleInputSchema,
} from "../schemas/tools.js";
import { PulsarValidationError } from "../errors.js";
import type { McpToolHandler } from "../types.js";

export interface VestingRelease {
  release_date: string;
  amount: string;
  released: boolean;
}

export interface VestingScheduleOutput {
  beneficiary_type: string;
  total_amount: string;
  start_date: string;
  cliff_date: string;
  end_date: string;
  released_amount: string;
  unreleased_amount: string;
  vesting_percentage: number;
  next_release_date?: string;
  schedule: VestingRelease[];
}

/**
 * Tool: compute_vesting_schedule
 * Calculates a token vesting / timelock release schedule for team and investors.
 * Returns the amount released so far, remaining locked amount, and full schedule.
 */
export const computeVestingSchedule: McpToolHandler<
  typeof ComputeVestingScheduleInputSchema
> = async (input: unknown) => {
  const validatedInput = ComputeVestingScheduleInputSchema.safeParse(input);
  if (!validatedInput.success) {
    throw new PulsarValidationError(
      "Invalid input for compute_vesting_schedule",
      validatedInput.error.format()
    );
  }

  const {
    total_amount,
    start_timestamp,
    cliff_seconds,
    vesting_duration_seconds,
    release_frequency_seconds,
    beneficiary_type,
    current_timestamp,
  } = validatedInput.data;

  if (cliff_seconds >= vesting_duration_seconds) {
    throw new PulsarValidationError(
      "cliff_seconds must be less than vesting_duration_seconds"
    );
  }

  if (release_frequency_seconds > vesting_duration_seconds) {
    throw new PulsarValidationError(
      "release_frequency_seconds must not exceed vesting_duration_seconds"
    );
  }

  const now = current_timestamp ?? Math.floor(Date.now() / 1000);
  const startDate = new Date(start_timestamp * 1000);
  const cliffDate = new Date((start_timestamp + cliff_seconds) * 1000);
  const endDate = new Date((start_timestamp + vesting_duration_seconds) * 1000);

  const elapsed = Math.max(0, Math.min(now - start_timestamp, vesting_duration_seconds));

  let released = 0;
  if (elapsed >= cliff_seconds) {
    const vestingElapsed = elapsed - cliff_seconds;
    const vestingDuration = vesting_duration_seconds - cliff_seconds;
    const periodsElapsed = Math.floor(vestingElapsed / release_frequency_seconds);
    const totalPeriods = Math.ceil(vestingDuration / release_frequency_seconds);
    released = totalPeriods > 0
      ? (total_amount * periodsElapsed) / totalPeriods
      : total_amount;
  }

  const unreleased = total_amount - released;
  const percentage = total_amount > 0 ? (released / total_amount) * 100 : 0;

  // Build schedule
  const schedule: VestingRelease[] = [];
  const vestingDuration = vesting_duration_seconds - cliff_seconds;
  const totalPeriods = Math.ceil(vestingDuration / release_frequency_seconds);
  const amountPerPeriod = totalPeriods > 0 ? total_amount / totalPeriods : total_amount;

  for (let i = 0; i < totalPeriods; i++) {
    const releaseTimestamp = start_timestamp + cliff_seconds + (i + 1) * release_frequency_seconds;
    // Cap the last period to end exactly at end_date
    const actualTimestamp = Math.min(releaseTimestamp, start_timestamp + vesting_duration_seconds);
    const isReleased = now >= actualTimestamp;
    schedule.push({
      release_date: new Date(actualTimestamp * 1000).toISOString(),
      amount: amountPerPeriod.toFixed(7),
      released: isReleased,
    });
  }

  // Adjust last period amount to account for rounding
  if (schedule.length > 0) {
    const sumPeriods = schedule.reduce((sum, s) => sum + parseFloat(s.amount), 0);
    const diff = total_amount - sumPeriods;
    if (Math.abs(diff) > 0.0000001) {
      schedule[schedule.length - 1].amount = (parseFloat(schedule[schedule.length - 1].amount) + diff).toFixed(7);
    }
  }

  // Find next release date
  const nextRelease = schedule.find((s) => !s.released);

  return {
    beneficiary_type,
    total_amount: total_amount.toFixed(7),
    start_date: startDate.toISOString(),
    cliff_date: cliffDate.toISOString(),
    end_date: endDate.toISOString(),
    released_amount: released.toFixed(7),
    unreleased_amount: unreleased.toFixed(7),
    vesting_percentage: parseFloat(percentage.toFixed(2)),
    next_release_date: nextRelease?.release_date,
    schedule,
  };
};
