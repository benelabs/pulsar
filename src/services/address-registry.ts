import { readFile, writeFile, rename } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { StellarPublicKeySchema, ContractIdSchema } from '../schemas/index.js';
import { PulsarValidationError } from '../errors.js';
import { config } from '../config.js';
import logger from '../logger.js';

function isValidAddress(address: string): boolean {
  return (
    StellarPublicKeySchema.safeParse(address).success ||
    ContractIdSchema.safeParse(address).success
  );
}

export class AddressRegistry {
  private addresses: Set<string> = new Set();
  private filePath: string | undefined;

  constructor(filePath?: string) {
    this.filePath = filePath;
  }

  /** Load addresses from env config and optional file. Called at startup. */
  async load(): Promise<void> {
    // Set filePath from config for persistence (only if not set via constructor)
    if (!this.filePath) {
      this.filePath = config.restrictedAddressesFile;
    }

    // Parse comma-separated env addresses
    if (config.restrictedAddresses) {
      for (const raw of config.restrictedAddresses.split(',')) {
        const address = raw.trim();
        if (address) {
          this.add(address);
        }
      }
    }

    // Merge addresses from file if configured
    if (config.restrictedAddressesFile) {
      try {
        const contents = await readFile(config.restrictedAddressesFile, 'utf-8');
        const parsed = JSON.parse(contents) as unknown;
        if (Array.isArray(parsed)) {
          for (const address of parsed) {
            if (typeof address === 'string') {
              this.add(address);
            }
          }
        }
      } catch (err) {
        logger.warn({ err, file: config.restrictedAddressesFile }, 'Failed to read restricted addresses file; continuing without it');
      }
    }
  }

  /** Add a validated address. Throws PulsarValidationError if malformed. */
  add(address: string): void {
    if (!isValidAddress(address)) {
      throw new PulsarValidationError(
        `Invalid address '${address}': must be a well-formed Stellar public key (G..., 56 chars, base32) or Soroban contract ID (C..., 56 chars, base32)`,
        { address }
      );
    }
    this.addresses.add(address);
    void this.persist();
  }

  /** Remove an address. No-op if not present. */
  remove(address: string): void {
    this.addresses.delete(address);
    void this.persist();
  }

  /** Atomically persist current set to file (write temp → rename). */
  private async persist(): Promise<void> {
    if (!this.filePath) return;
    const tmp = join(tmpdir(), `pulsar-restricted-${Date.now()}.json.tmp`);
    try {
      await writeFile(tmp, JSON.stringify(this.list()), 'utf-8');
      await rename(tmp, this.filePath);
    } catch (err) {
      logger.error({ err, file: this.filePath }, 'Failed to persist restricted addresses file');
    }
  }

  /** Return all restricted addresses as a sorted array. */
  list(): string[] {
    return Array.from(this.addresses).sort();
  }

  /** Return true if the address is restricted. */
  has(address: string): boolean {
    return this.addresses.has(address);
  }
}

export const addressRegistry = new AddressRegistry();
