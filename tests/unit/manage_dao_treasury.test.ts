import { describe, it, expect } from 'vitest';

import { manageDaoTreasury } from '../../src/tools/manage_dao_treasury.js';

describe('manageDaoTreasury', () => {
  const TEST_TREASURY_ACCOUNT = 'GDGQVOKHW4VEJRU2TETD6DBRKEM5NRJ3RFA3FPMMNJLR3FIX4AM6J';

  it('validates input via zod schema when action is missing', async () => {
    await expect(
      manageDaoTreasury({
        treasury_address: TEST_TREASURY_ACCOUNT,
        asset: 'XLM',
      })
    ).rejects.toThrow('Invalid input');
  });

  it('validates treasury address format - invalid', async () => {
    await expect(
      manageDaoTreasury({
        action: 'balance',
        treasury_address: 'INVALID',
        asset: 'XLM',
      })
    ).rejects.toThrow();
  });

  it('validates amount format for deposit', async () => {
    await expect(
      manageDaoTreasury({
        action: 'deposit',
        treasury_address: TEST_TREASURY_ACCOUNT,
        amount: 'not-a-number',
        asset: 'XLM',
      })
    ).rejects.toThrow();
  });
});
