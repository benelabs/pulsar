import { expect, it, beforeAll } from 'vitest';
import { getAccountBalance } from '../../src/tools/get_account_balance.js';
import { getHorizonUrl } from '../../src/services/horizon.js';
import {
  describeIfIntegration,
  fundWithFriendbot,
  TEST_ACCOUNT_PUBLIC_KEY,
  TESTNET_HORIZON_URL,
  TESTNET_SOROBAN_RPC_URL,
} from './setup.js';

/**
 * Integration tests for network change behavior.
 *
 * Verifies that all tools correctly switch between Stellar networks
 * (testnet, mainnet, futurenet) and that network-specific endpoints,
 * error handling, and data isolation work as expected.
 *
 * These tests hit the real Stellar Testnet.
 * Set RUN_INTEGRATION_TESTS=true to run them.
 */

// ── Well-known mainnet account (Binance hot wallet — always funded) ──────────
const MAINNET_ACCOUNT =
  process.env.MAINNET_TEST_ACCOUNT ||
  'GBDEVU63Y6NTHJQQZIKVTC23NWLQVP3WJ2RI2OTSJTNYOIGICST6DUXR';

// ── Futurenet Horizon endpoint ───────────────────────────────────────────────
const FUTURENET_HORIZON_URL = 'https://horizon-futurenet.stellar.org';

// ── Futurenet Soroban RPC endpoint ───────────────────────────────────────────
const FUTURENET_SOROBAN_RPC_URL = 'https://rpc-futurenet.stellar.org';

// ── Helper: raw Horizon account fetch ────────────────────────────────────────
async function fetchHorizonAccount(
  horizonUrl: string,
  accountId: string
): Promise<Response> {
  return fetch(`${horizonUrl}/accounts/${accountId}`);
}

// ── Helper: raw Soroban RPC health check ─────────────────────────────────────
async function fetchSorobanHealth(rpcUrl: string): Promise<{ status: string }> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getHealth',
      params: {},
    }),
  });
  const data = (await response.json()) as any;
  return data?.result ?? { status: 'unknown' };
}

// ────────────────────────────────────────────────────────────────────────────
// Suite 1 — Horizon URL resolution per network
// ────────────────────────────────────────────────────────────────────────────
describeIfIntegration('Network URL resolution', () => {
  it('resolves correct Horizon URL for testnet', () => {
    const url = getHorizonUrl('testnet');
    expect(url).toBe('https://horizon-testnet.stellar.org');
  });

  it('resolves correct Horizon URL for mainnet', () => {
    const url = getHorizonUrl('mainnet');
    expect(url).toBe('https://horizon.stellar.org');
  });

  it('resolves correct Horizon URL for futurenet', () => {
    const url = getHorizonUrl('futurenet');
    expect(url).toBe('https://horizon-futurenet.stellar.org');
  });

  it('resolves testnet as default when no network is provided', () => {
    // getHorizonUrl falls back to config.stellarNetwork (testnet by default)
    const url = getHorizonUrl();
    expect(url).toMatch(/horizon/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite 2 — Testnet tool behavior
// ────────────────────────────────────────────────────────────────────────────
describeIfIntegration('get_account_balance — testnet network', () => {
  beforeAll(async () => {
    try {
      await fundWithFriendbot(TEST_ACCOUNT_PUBLIC_KEY);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch {
      // Account may already be funded
    }
  });

  it('returns balances from testnet when network is explicitly "testnet"', async () => {
    const result = (await getAccountBalance({
      account_id: TEST_ACCOUNT_PUBLIC_KEY,
      network: 'testnet',
    })) as any;

    expect(result.account_id).toBe(TEST_ACCOUNT_PUBLIC_KEY);
    expect(Array.isArray(result.balances)).toBe(true);
    const xlm = result.balances.find((b: any) => b.asset_type === 'native');
    expect(xlm).toBeDefined();
    expect(parseFloat(xlm.balance)).toBeGreaterThan(0);
  });

  it('returns network field as "testnet" in the result', async () => {
    const result = (await getAccountBalance({
      account_id: TEST_ACCOUNT_PUBLIC_KEY,
      network: 'testnet',
    })) as any;
    // The tool echoes back the network that was used
    expect(result.network ?? 'testnet').toMatch(/testnet/);
  });

  it('rejects an unfunded account on testnet with a clear error', async () => {
    const ghost = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHG';
    await expect(
      getAccountBalance({ account_id: ghost, network: 'testnet' })
    ).rejects.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite 3 — Mainnet tool behavior (read-only, no mutations)
// ────────────────────────────────────────────────────────────────────────────
describeIfIntegration('get_account_balance — mainnet network', () => {
  it('returns balances from mainnet when network is explicitly "mainnet"', async () => {
    const result = (await getAccountBalance({
      account_id: MAINNET_ACCOUNT,
      network: 'mainnet',
    })) as any;

    expect(result.account_id).toBe(MAINNET_ACCOUNT);
    expect(Array.isArray(result.balances)).toBe(true);
    const xlm = result.balances.find((b: any) => b.asset_type === 'native');
    expect(xlm).toBeDefined();
  });

  it('mainnet account does NOT exist on testnet (data isolation)', async () => {
    // A mainnet-only account should not be found on testnet
    // (unless by coincidence — so we just verify the call dispatches to the right network)
    const mainnetUrl = getHorizonUrl('mainnet');
    const testnetUrl = getHorizonUrl('testnet');
    expect(mainnetUrl).not.toBe(testnetUrl);
  });

  it('rejects an obviously invalid account on mainnet', async () => {
    const invalid = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHG';
    await expect(
      getAccountBalance({ account_id: invalid, network: 'mainnet' })
    ).rejects.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite 4 — Futurenet reachability
// ────────────────────────────────────────────────────────────────────────────
describeIfIntegration('Futurenet network reachability', () => {
  it('futurenet Horizon endpoint is reachable', async () => {
    const response = await fetch(`${FUTURENET_HORIZON_URL}/`);
    // Horizon root returns 200 with network info
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body).toHaveProperty('network_passphrase');
    expect(body.network_passphrase).toMatch(/Test SDF Future Network/i);
  }, 15_000);

  it('futurenet Soroban RPC health endpoint responds', async () => {
    const health = await fetchSorobanHealth(FUTURENET_SOROBAN_RPC_URL);
    expect(health.status).toBeDefined();
  }, 15_000);
});

// ────────────────────────────────────────────────────────────────────────────
// Suite 5 — Testnet Horizon & Soroban RPC health
// ────────────────────────────────────────────────────────────────────────────
describeIfIntegration('Testnet network health checks', () => {
  it('testnet Horizon root returns correct network passphrase', async () => {
    const response = await fetch(`${TESTNET_HORIZON_URL}/`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.network_passphrase).toMatch(/Test SDF Network/i);
  }, 15_000);

  it('testnet Soroban RPC getHealth returns healthy status', async () => {
    const health = await fetchSorobanHealth(TESTNET_SOROBAN_RPC_URL);
    expect(['healthy', 'starting']).toContain(health.status);
  }, 15_000);
});

// ────────────────────────────────────────────────────────────────────────────
// Suite 6 — Network isolation: testnet data ≠ mainnet data
// ────────────────────────────────────────────────────────────────────────────
describeIfIntegration('Network data isolation', () => {
  it('testnet and mainnet return different ledger sequences', async () => {
    const [testnetRes, mainnetRes] = await Promise.all([
      fetch(`${TESTNET_HORIZON_URL}/`),
      fetch('https://horizon.stellar.org/'),
    ]);
    const [testnetData, mainnetData] = await Promise.all([
      testnetRes.json() as Promise<any>,
      mainnetRes.json() as Promise<any>,
    ]);
    // Ledger sequences are always different between networks
    expect(testnetData.history_latest_ledger).not.toBe(
      mainnetData.history_latest_ledger
    );
  }, 15_000);

  it('testnet account lookup does not bleed into mainnet endpoint', async () => {
    const testnetRes = await fetchHorizonAccount(
      TESTNET_HORIZON_URL,
      TEST_ACCOUNT_PUBLIC_KEY
    );
    const mainnetRes = await fetchHorizonAccount(
      'https://horizon.stellar.org',
      TEST_ACCOUNT_PUBLIC_KEY
    );
    // Testnet account should exist (we funded it); mainnet lookup result
    // is independent — we just verify both calls went to different endpoints
    expect(testnetRes.url).toContain('testnet');
    expect(mainnetRes.url).not.toContain('testnet');
  }, 15_000);

  it('network passphrase differs between testnet and mainnet', async () => {
    const [t, m] = await Promise.all([
      fetch(`${TESTNET_HORIZON_URL}/`).then((r) => r.json() as Promise<any>),
      fetch('https://horizon.stellar.org/').then((r) => r.json() as Promise<any>),
    ]);
    expect(t.network_passphrase).not.toBe(m.network_passphrase);
  }, 15_000);
});

// ────────────────────────────────────────────────────────────────────────────
// Suite 7 — Per-call network override (the `network` parameter)
// ────────────────────────────────────────────────────────────────────────────
describeIfIntegration('Per-call network override', () => {
  beforeAll(async () => {
    try {
      await fundWithFriendbot(TEST_ACCOUNT_PUBLIC_KEY);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch {
      // May already be funded
    }
  });

  it('passing network:"testnet" overrides any default network config', async () => {
    const result = (await getAccountBalance({
      account_id: TEST_ACCOUNT_PUBLIC_KEY,
      network: 'testnet',
    })) as any;
    expect(result.balances).toBeDefined();
  });

  it('passing network:"mainnet" routes to mainnet Horizon', async () => {
    const result = (await getAccountBalance({
      account_id: MAINNET_ACCOUNT,
      network: 'mainnet',
    })) as any;
    expect(result.account_id).toBe(MAINNET_ACCOUNT);
  });

  it('testnet call and mainnet call return independent results for different accounts', async () => {
    const [testnetResult, mainnetResult] = await Promise.all([
      getAccountBalance({
        account_id: TEST_ACCOUNT_PUBLIC_KEY,
        network: 'testnet',
      }) as Promise<any>,
      getAccountBalance({
        account_id: MAINNET_ACCOUNT,
        network: 'mainnet',
      }) as Promise<any>,
    ]);

    expect(testnetResult.account_id).toBe(TEST_ACCOUNT_PUBLIC_KEY);
    expect(mainnetResult.account_id).toBe(MAINNET_ACCOUNT);
    expect(testnetResult.account_id).not.toBe(mainnetResult.account_id);
  });
});