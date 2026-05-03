import { PulsarValidationError } from "../errors.js";
import logger from "../logger.js";

/**
 * Parses a CIDR string into a network address (as 32-bit int) and mask.
 * Supports only IPv4.
 */
function parseCidr(cidr: string): { network: number; mask: number } | null {
  const parts = cidr.trim().split("/");
  if (parts.length !== 2) return null;

  const [ipPart, prefixLenStr] = parts;
  const prefixLen = parseInt(prefixLenStr, 10);

  if (isNaN(prefixLen) || prefixLen < 0 || prefixLen > 32) return null;

  const octets = ipPart.split(".").map(Number);
  if (octets.length !== 4 || octets.some((o) => isNaN(o) || o < 0 || o > 255)) return null;

  const network =
    ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  const mask = prefixLen === 0 ? 0 : (0xffffffff << (32 - prefixLen)) >>> 0;

  return { network: network & mask, mask };
}

/**
 * Converts an IPv4 string to a 32-bit unsigned integer.
 */
function ipToInt(ip: string): number | null {
  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((o) => isNaN(o) || o < 0 || o > 255)) return null;
  return (
    ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0
  );
}

/**
 * AccessControl enforces an operator-defined allowlist of domains and CIDR ranges
 * for all outbound HTTP requests made by the Pulsar MCP server.
 *
 * If no allowlist is configured (permissive default), all destinations are allowed.
 * Once any allowlist entry is configured, only matching destinations are permitted.
 *
 * Time Complexity:  O(D) for domain lookups, O(R) for CIDR checks
 * Space Complexity: O(D + R) where D = domains, R = CIDR ranges
 */
export class AccessControl {
  private readonly allowedDomains: Set<string>;
  private readonly allowedCidrs: Array<{ network: number; mask: number }>;
  private readonly isEnabled: boolean;

  constructor(allowedDomains: string[], allowedCidrs: string[]) {
    this.allowedDomains = new Set(
      allowedDomains.map((d) => d.trim().toLowerCase()).filter(Boolean)
    );

    this.allowedCidrs = allowedCidrs
      .map((c) => parseCidr(c.trim()))
      .filter((c): c is { network: number; mask: number } => c !== null);

    this.isEnabled = this.allowedDomains.size > 0 || this.allowedCidrs.length > 0;
  }

  /**
   * Asserts that the given URL is permitted by the access control policy.
   * Throws PulsarValidationError if the URL is blocked.
   */
  assertAllowed(url: string): void {
    if (!this.isEnabled) return;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new PulsarValidationError(`Invalid URL format: ${url}`);
    }

    const hostname = parsed.hostname.toLowerCase();

    // 1. Domain allowlist check — O(D)
    if (this.allowedDomains.has(hostname)) return;

    // 2. CIDR allowlist check — O(R)
    const ipInt = ipToInt(hostname);
    if (ipInt !== null) {
      for (const { network, mask } of this.allowedCidrs) {
        if ((ipInt & mask) === network) return;
      }
    }

    logger.warn({ url, hostname }, "Access control: outbound request blocked");
    throw new PulsarValidationError(
      `Outbound request to "${hostname}" is not permitted. ` +
        `Add it to ALLOWED_DOMAINS or ALLOWED_IP_RANGES to allow access.`
    );
  }
}

/**
 * Singleton instance built from environment variables.
 *
 * ALLOWED_DOMAINS  — comma-separated hostnames, e.g. "horizon.stellar.org,soroban-testnet.stellar.org"
 * ALLOWED_IP_RANGES — comma-separated CIDR ranges, e.g. "10.0.0.0/8,192.168.1.0/24"
 */
const rawDomains = process.env.ALLOWED_DOMAINS ?? "";
const rawCidrs = process.env.ALLOWED_IP_RANGES ?? "";

export const accessControl = new AccessControl(
  rawDomains ? rawDomains.split(",") : [],
  rawCidrs ? rawCidrs.split(",") : []
);
