import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { config } from '../config.js';
import { PulsarCliError } from '../errors.js';
import logger from '../logger.js';

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Run the Stellar CLI with the given argument array.
 * Args are NEVER joined via string interpolation — execFile handles escaping.
 */
export async function runStellarCli(
  args: string[],
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<{ stdout: string; stderr: string }> {
  const bin = config.stellarCliPath;
  logger.debug({ bin, args }, 'Executing Stellar CLI command');
  try {
    return await execFileAsync(bin, args, { timeout: timeoutMs });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const errorMessage = e.stderr?.trim() || e.message || String(err);
    throw new PulsarCliError(`Stellar CLI error: ${errorMessage}`, {
      stdout: e.stdout,
      stderr: e.stderr,
    });
  }
}
