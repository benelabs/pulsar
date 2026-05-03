import { describe, it, expect, beforeEach, vi } from 'vitest';

import { getHorizonServer, getHorizonUrl } from '../../../src/services/horizon';
import { getSorobanServer, getRpcUrl } from '../../../src/services/soroban-rpc';

// We cannot easily clear the module caches between tests because the caches are module-level Maps.
// We'll rely on vitest's isolated test environment (each test file runs in its own worker) and
// use beforeEach to reset module state by re-importing? Instead, we'll just test that
// multiple calls within a test get same instance, and different networks give different instances.

describe('Service lazy loading', () => {
  describe('getHorizonServer', () => {
    it('returns the same instance on subsequent calls (caching)', async () => {
      const server1 = getHorizonServer('testnet');
      const server2 = getHorizonServer('testnet');
      expect(server1).toBe(server2);
    });

    it('returns different instances for different networks', async () => {
      const testnet = getHorizonServer('testnet');
      const mainnet = getHorizonServer('mainnet');
      expect(testnet).not.toBe(mainnet);
    });

    it('reuses cached server after first creation', async () => {
      const testnet1 = getHorizonServer('testnet');
      const testnet2 = getHorizonServer('testnet');
      expect(testnet1).toBe(testnet2);
    });
  });

  describe('getSorobanServer', () => {
    it('returns the same instance on subsequent calls (caching)', async () => {
      const server1 = getSorobanServer('testnet');
      const server2 = getSorobanServer('testnet');
      expect(server1).toBe(server2);
    });

    it('returns different instances for different networks', async () => {
      const testnet = getSorobanServer('testnet');
      const mainnet = getSorobanServer('mainnet');
      expect(testnet).not.toBe(mainnet);
    });

    it('reuses cached server after first creation', async () => {
      const testnet1 = getSorobanServer('testnet');
      const testnet2 = getSorobanServer('testnet');
      expect(testnet1).toBe(testnet2);
    });
  });

  describe('getHorizonUrl', () => {
    it('returns correct URL for mainnet', () => {
      expect(getHorizonUrl('mainnet')).toBe('https://horizon.stellar.org');
    });

    it('returns correct URL for testnet', () => {
      expect(getHorizonUrl('testnet')).toBe('https://horizon-testnet.stellar.org');
    });

    it('returns correct URL for futurenet', () => {
      expect(getHorizonUrl('futurenet')).toBe('https://horizon-futurenet.stellar.org');
    });
  });

  describe('getRpcUrl', () => {
    it('returns correct URL for mainnet', () => {
      expect(getRpcUrl('mainnet')).toBe('https://soroban-rpc.stellar.org');
    });

    it('returns correct URL for testnet', () => {
      expect(getRpcUrl('testnet')).toBe('https://soroban-testnet.stellar.org');
    });

    it('returns correct URL for futurenet', () => {
      expect(getRpcUrl('futurenet')).toBe('https://rpc-futurenet.stellar.org');
    });
  });
});
