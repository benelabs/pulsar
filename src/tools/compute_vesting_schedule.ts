import { ComputeVestingScheduleInputSchema } from '../schemas/tools.js';
import { PulsarValidationError } from '../errors.js';
import type { McpToolHandler } from '../types.js';
import { toStroops, fromStroops, safeSub, safeMul, safeDiv, safeAdd } from '../utils/safe_math.js';

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
      'Invalid input for compute_vesting_schedule',
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
    throw new PulsarValidationError('cliff_seconds must be less than vesting_duration_seconds');
  }

  if (release_frequency_seconds > vesting_duration_seconds) {
    throw new PulsarValidationError(
      'release_frequency_seconds must not exceed vesting_duration_seconds'
    );
  }

  const now = current_timestamp ?? Math.floor(Date.now() / 1000);
  const startDate = new Date(start_timestamp * 1000);
  const cliffDate = new Date((start_timestamp + cliff_seconds) * 1000);
  const endDate = new Date((start_timestamp + vesting_duration_seconds) * 1000);

  const elapsed = Math.max(0, Math.min(now - start_timestamp, vesting_duration_seconds));
  const totalAmountStroops = toStroops(total_amount);

  let releasedStroops = 0n;
  if (elapsed >= cliff_seconds) {
    const vestingElapsed = BigInt(elapsed - cliff_seconds);
    const vestingDuration = BigInt(vesting_duration_seconds - cliff_seconds);
    const releaseFrequency = BigInt(release_frequency_seconds);

    const periodsElapsed = vestingElapsed / releaseFrequency;
    const totalPeriods = (vestingDuration + releaseFrequency - 1n) / releaseFrequency; // Ceiling division

    releasedStroops =
      totalPeriods > 0n
        ? safeDiv(safeMul(totalAmountStroops, periodsElapsed), totalPeriods)
        : totalAmountStroops;
  let released = 0;
  if (elapsed >= vesting_duration_seconds) {
    released = total_amount;
  } else if (elapsed >= cliff_seconds) {
    const vestingElapsed = elapsed - cliff_seconds;
    const vestingDuration = vesting_duration_seconds - cliff_seconds;
    const periodsElapsed = Math.floor(vestingElapsed / release_frequency_seconds);
    const totalPeriods = Math.ceil(vestingDuration / release_frequency_seconds);
    released = totalPeriods > 0 ? (total_amount * periodsElapsed) / totalPeriods : total_amount;
  }

  const unreleasedStroops = safeSub(totalAmountStroops, releasedStroops);
  const percentage = total_amount > 0 ? (fromStroops(releasedStroops) / total_amount) * 100 : 0;

  // Build schedule
  const schedule: VestingRelease[] = [];
  const vestingDuration = BigInt(vesting_duration_seconds - cliff_seconds);
  const releaseFrequency = BigInt(release_frequency_seconds);
  const totalPeriods = (vestingDuration + releaseFrequency - 1n) / releaseFrequency;
  const amountPerPeriodStroops =
    totalPeriods > 0n ? safeDiv(totalAmountStroops, totalPeriods) : totalAmountStroops;

  let allocatedStroops = 0n;
  for (let i = 0; i < Number(totalPeriods); i++) {
    const releaseTimestamp =
      BigInt(start_timestamp + cliff_seconds) + BigInt(i + 1) * releaseFrequency;
    // Cap the last period to end exactly at end_date
    const actualTimestamp =
      Number(releaseTimestamp) > start_timestamp + vesting_duration_seconds
        ? start_timestamp + vesting_duration_seconds
        : Number(releaseTimestamp);

    const isReleased = now >= actualTimestamp;

    let currentPeriodAmountStroops = amountPerPeriodStroops;
    // Handle rounding for the last period
    if (i === Number(totalPeriods) - 1) {
      currentPeriodAmountStroops = safeSub(totalAmountStroops, allocatedStroops);
    }

    schedule.push({
      release_date: new Date(actualTimestamp * 1000).toISOString(),
      amount: fromStroops(currentPeriodAmountStroops).toFixed(7),
      released: isReleased,
    });

    allocatedStroops = safeAdd(allocatedStroops, currentPeriodAmountStroops);
  // Adjust last period amount to account for rounding
  if (schedule.length > 0) {
    const sumPeriods = schedule.reduce((sum, s) => sum + parseFloat(s.amount), 0);
    const diff = total_amount - sumPeriods;
    if (Math.abs(diff) > 0.0000001) {
      schedule[schedule.length - 1].amount = (
        parseFloat(schedule[schedule.length - 1].amount) + diff
      ).toFixed(7);
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
    released_amount: fromStroops(releasedStroops).toFixed(7),
    unreleased_amount: fromStroops(unreleasedStroops).toFixed(7),
    vesting_percentage: parseFloat(percentage.toFixed(2)),
    next_release_date: nextRelease?.release_date,
    schedule,
  };
};
