import { Keypair } from "@stellar/stellar-sdk";
import { config } from "../config.js";
import { PulsarValidationError, PulsarNetworkError } from "../errors.js";
import logger from "../logger.js";

/**
 * Key rotation state for Stellar secret keys.
 * Supports seamless rotation with overlap period where both old and new keys are valid.
 */

export interface KeyRotationState {
  currentKey: string;
  previousKey?: string;
  rotatedAt: number;
  overlapExpiresAt: number;
  rotationCount: number;
}

export interface KeyPairInfo {
  publicKey: string;
  secretKey: string;
  createdAt: number;
  expiresAt?: number;
}

const ROTATION_OVERLAP_MS = 24 * 60 * 60 * 1000; // 24 hours overlap for old key

// In-memory state (in production, persist to secure storage)
let rotationState: KeyRotationState | null = null;
const keyHistory: KeyPairInfo[] = [];

/**
 * Initialize the key rotation system with the current configured key.
 */
export function initKeyRotation(): KeyRotationState {
  const currentKey = config.stellarSecretKey;

  if (!currentKey) {
    logger.warn("No STELLAR_SECRET_KEY configured — key rotation disabled");
    rotationState = {
      currentKey: "",
      rotatedAt: 0,
      overlapExpiresAt: 0,
      rotationCount: 0,
    };
    return rotationState;
  }

  rotationState = {
    currentKey,
    rotatedAt: Date.now(),
    overlapExpiresAt: 0,
    rotationCount: 0,
  };

  keyHistory.push({
    publicKey: Keypair.fromSecret(currentKey).publicKey(),
    secretKey: currentKey,
    createdAt: Date.now(),
  });

  logger.info(
    { publicKey: keyHistory[0].publicKey },
    "Key rotation system initialized"
  );

  return rotationState;
}

/**
 * Rotate to a new secret key.
 * The old key remains valid for verification during the overlap period.
 *
 * @returns The new keypair info (NEVER log the secret key in production)
 */
export function rotateKey(newSecretKey?: string): KeyPairInfo {
  if (!rotationState) {
    throw new PulsarValidationError(
      "Key rotation not initialized — configure STELLAR_SECRET_KEY first"
    );
  }

  // Generate new keypair if not provided
  const newKeypair = newSecretKey
    ? Keypair.fromSecret(newSecretKey)
    : Keypair.random();

  const oldKey = rotationState.currentKey;
  const now = Date.now();

  // Move current to previous
  rotationState.previousKey = oldKey;
  rotationState.currentKey = newKeypair.secret();
  rotationState.rotatedAt = now;
  rotationState.overlapExpiresAt = now + ROTATION_OVERLAP_MS;
  rotationState.rotationCount += 1;

  const keyInfo: KeyPairInfo = {
    publicKey: newKeypair.publicKey(),
    secretKey: newKeypair.secret(),
    createdAt: now,
  };

  keyHistory.push(keyInfo);

  logger.info(
    {
      rotationCount: rotationState.rotationCount,
      publicKey: keyInfo.publicKey,
      overlapMinutes: ROTATION_OVERLAP_MS / 60000,
    },
    "Secret key rotated successfully"
  );

  return keyInfo;
}

/**
 * Get the currently active keypair for signing.
 */
export function getActiveKeypair(): Keypair | null {
  if (!rotationState?.currentKey) return null;
  try {
    return Keypair.fromSecret(rotationState.currentKey);
  } catch (e) {
    logger.error({ error: e }, "Failed to parse current secret key");
    return null;
  }
}

/**
 * Get the previous keypair for verification during overlap period.
 */
export function getPreviousKeypair(): Keypair | null {
  if (
    !rotationState?.previousKey ||
    Date.now() > rotationState.overlapExpiresAt
  ) {
    return null;
  }
  try {
    return Keypair.fromSecret(rotationState.previousKey);
  } catch (e) {
    return null;
  }
}

/**
 * Check if a public key matches either the current or previous keypair.
 * Useful for verifying signatures during the overlap period.
 */
export function isKeyValid(publicKey: string): boolean {
  const active = getActiveKeypair();
  if (active && active.publicKey() === publicKey) return true;

  const previous = getPreviousKeypair();
  if (previous && previous.publicKey() === publicKey) return true;

  return false;
}

/**
 * Get the current rotation state (safe for API responses — no secret keys).
 */
export function getRotationState(): Omit<
  KeyRotationState,
  "currentKey" | "previousKey"
> & {
  publicKey: string;
  previousPublicKey?: string;
  isOverlapping: boolean;
} {
  if (!rotationState) {
    throw new PulsarValidationError("Key rotation not initialized");
  }

  return {
    rotatedAt: rotationState.rotatedAt,
    overlapExpiresAt: rotationState.overlapExpiresAt,
    rotationCount: rotationState.rotationCount,
    publicKey: getActiveKeypair()?.publicKey() || "",
    previousPublicKey: getPreviousKeypair()?.publicKey(),
    isOverlapping: Date.now() < rotationState.overlapExpiresAt,
  };
}

/**
 * Get key rotation history (public keys only — no secrets).
 */
export function getKeyHistory(): Array<
  Omit<KeyPairInfo, "secretKey">
> {
  return keyHistory.map(({ publicKey, createdAt, expiresAt }) => ({
    publicKey,
    createdAt,
    expiresAt,
  }));
}

/**
 * Validate that a secret key is properly formatted (S...56 chars).
 */
export function validateStellarSecretKey(key: string): boolean {
  try {
    const keypair = Keypair.fromSecret(key);
    return keypair.secret().startsWith("S") && key.length === 56;
  } catch {
    return false;
  }
}

// Auto-initialize on import
initKeyRotation();