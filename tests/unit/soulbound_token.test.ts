import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionBuilder, Networks, Keypair, Account } from '@stellar/stellar-sdk';

import { soulboundToken } from '../../src/tools/soulbound_token.js';
import { getHorizonServer } from '../../src/services/horizon.js';

vi.mock('../../src/services/horizon.js', () => ({
  getHorizonServer: vi.fn(),
}));

const SOURCE = Keypair.random().publicKey();
const RECIPIENT = Keypair.random().publicKey();
const CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const TOKEN_ID = 'abc123token';

describe('soulboundToken', () => {
  let mockServer: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = { loadAccount: vi.fn() };
    vi.mocked(getHorizonServer).mockReturnValue(mockServer);
    mockServer.loadAccount.mockResolvedValue(new Account(SOURCE, '100'));
  });

  // ── mint ──────────────────────────────────────────────────────────────────

  describe('mint', () => {
    it('builds a valid mint transaction XDR', async () => {
      const result = (await soulboundToken({
        action: 'mint',
        contract_id: CONTRACT_ID,
        source_account: SOURCE,
        recipient: RECIPIENT,
        metadata: '{"role":"member"}',
      })) as any;

      expect(result.action).toBe('mint');
      expect(result.transaction_xdr).toBeDefined();
      expect(result.contract_id).toBe(CONTRACT_ID);
      expect(result.recipient).toBe(RECIPIENT);
      expect(result.token_id).toBeDefined();
      expect(result.network).toBe('testnet');
    });

    it('uses provided token_id when given', async () => {
      const result = (await soulboundToken({
        action: 'mint',
        contract_id: CONTRACT_ID,
        source_account: SOURCE,
        recipient: RECIPIENT,
        token_id: TOKEN_ID,
        metadata: 'badge:gold',
      })) as any;

      expect(result.token_id).toBe(TOKEN_ID);
    });

    it('auto-generates token_id when omitted', async () => {
      const r1 = (await soulboundToken({
        action: 'mint',
        contract_id: CONTRACT_ID,
        source_account: SOURCE,
        recipient: RECIPIENT,
        metadata: 'x',
      })) as any;

      const r2 = (await soulboundToken({
        action: 'mint',
        contract_id: CONTRACT_ID,
        source_account: SOURCE,
        recipient: RECIPIENT,
        metadata: 'x',
      })) as any;

      expect(r1.token_id).toBeDefined();
      expect(r2.token_id).toBeDefined();
      expect(r1.token_id).not.toBe(r2.token_id);
    });

    it('produces parseable XDR with one operation', async () => {
      const result = (await soulboundToken({
        action: 'mint',
        contract_id: CONTRACT_ID,
        source_account: SOURCE,
        recipient: RECIPIENT,
        metadata: 'test',
      })) as any;

      const tx = TransactionBuilder.fromXDR(result.transaction_xdr, Networks.TESTNET) as any;
      expect(tx.operations.length).toBe(1);
      expect(tx.source).toBe(SOURCE);
    });

    it('throws when recipient is missing', async () => {
      await expect(
        soulboundToken({
          action: 'mint',
          contract_id: CONTRACT_ID,
          source_account: SOURCE,
          metadata: 'x',
        } as any)
      ).rejects.toThrow('recipient is required for mint action');
    });

    it('throws when metadata is missing', async () => {
      await expect(
        soulboundToken({
          action: 'mint',
          contract_id: CONTRACT_ID,
          source_account: SOURCE,
          recipient: RECIPIENT,
        } as any)
      ).rejects.toThrow('metadata is required for mint action');
    });

    it('respects network override', async () => {
      const result = (await soulboundToken({
        action: 'mint',
        contract_id: CONTRACT_ID,
        source_account: SOURCE,
        recipient: RECIPIENT,
        metadata: 'x',
        network: 'mainnet',
      })) as any;

      expect(result.network).toBe('mainnet');
    });
  });

  // ── revoke ────────────────────────────────────────────────────────────────

  describe('revoke', () => {
    it('builds a valid revoke transaction XDR', async () => {
      const result = (await soulboundToken({
        action: 'revoke',
        contract_id: CONTRACT_ID,
        source_account: SOURCE,
        token_id: TOKEN_ID,
      })) as any;

      expect(result.action).toBe('revoke');
      expect(result.transaction_xdr).toBeDefined();
      expect(result.token_id).toBe(TOKEN_ID);
      expect(result.network).toBe('testnet');
    });

    it('produces parseable XDR with one operation', async () => {
      const result = (await soulboundToken({
        action: 'revoke',
        contract_id: CONTRACT_ID,
        source_account: SOURCE,
        token_id: TOKEN_ID,
      })) as any;

      const tx = TransactionBuilder.fromXDR(result.transaction_xdr, Networks.TESTNET) as any;
      expect(tx.operations.length).toBe(1);
    });

    it('throws when token_id is missing', async () => {
      await expect(
        soulboundToken({
          action: 'revoke',
          contract_id: CONTRACT_ID,
          source_account: SOURCE,
        } as any)
      ).rejects.toThrow('token_id is required for revoke action');
    });
  });

  // ── query ─────────────────────────────────────────────────────────────────

  describe('query', () => {
    it('builds a valid query transaction XDR', async () => {
      const result = (await soulboundToken({
        action: 'query',
        contract_id: CONTRACT_ID,
        source_account: SOURCE,
        recipient: RECIPIENT,
      })) as any;

      expect(result.action).toBe('query');
      expect(result.transaction_xdr).toBeDefined();
      expect(result.recipient).toBe(RECIPIENT);
      expect(result.network).toBe('testnet');
    });

    it('produces parseable XDR with one operation', async () => {
      const result = (await soulboundToken({
        action: 'query',
        contract_id: CONTRACT_ID,
        source_account: SOURCE,
        recipient: RECIPIENT,
      })) as any;

      const tx = TransactionBuilder.fromXDR(result.transaction_xdr, Networks.TESTNET) as any;
      expect(tx.operations.length).toBe(1);
    });

    it('throws when recipient is missing', async () => {
      await expect(
        soulboundToken({
          action: 'query',
          contract_id: CONTRACT_ID,
          source_account: SOURCE,
        } as any)
      ).rejects.toThrow('recipient is required for query action');
    });
  });

  // ── input validation ──────────────────────────────────────────────────────

  describe('input validation', () => {
    it('rejects invalid contract_id', async () => {
      await expect(
        soulboundToken({
          action: 'mint',
          contract_id: 'invalid',
          source_account: SOURCE,
          recipient: RECIPIENT,
          metadata: 'x',
        } as any)
      ).rejects.toThrow('Invalid input for soulbound_token');
    });

    it('rejects invalid source_account', async () => {
      await expect(
        soulboundToken({
          action: 'mint',
          contract_id: CONTRACT_ID,
          source_account: 'bad',
          recipient: RECIPIENT,
          metadata: 'x',
        } as any)
      ).rejects.toThrow('Invalid input for soulbound_token');
    });

    it('rejects invalid action', async () => {
      await expect(
        soulboundToken({
          action: 'transfer',
          contract_id: CONTRACT_ID,
          source_account: SOURCE,
        } as any)
      ).rejects.toThrow('Invalid input for soulbound_token');
    });

    it('handles unfunded source account', async () => {
      const err = new Error('Not Found');
      (err as any).response = { status: 404 };
      mockServer.loadAccount.mockRejectedValue(err);

      await expect(
        soulboundToken({
          action: 'mint',
          contract_id: CONTRACT_ID,
          source_account: SOURCE,
          recipient: RECIPIENT,
          metadata: 'x',
        })
      ).rejects.toThrow('not found');
    });
  });
});
