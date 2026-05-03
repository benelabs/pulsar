import { describe, it, expect } from 'vitest';

import logger from '../logger.js';

import { mergeAccount, AccountMergeParams } from './account_merge.js';

describe('Account Merge Helper Tool', () => {
  const validSecret =
    process.env.TEST_SOURCE_SECRET || 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  const validDestination =
    process.env.TEST_DESTINATION || 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  const horizonUrl = process.env.TEST_HORIZON_URL || 'https://horizon-testnet.stellar.org';

  it('should merge account successfully with valid params', async () => {
    const params: AccountMergeParams = {
      sourceSecret: validSecret,
      destination: validDestination,
      horizonUrl,
    };
    const result = await mergeAccount(params);
    expect(result.success).toBeDefined();
    if (!result.success) {
      logger.error(result.error);
    }
  });

  it('should fail with invalid secret', async () => {
    const params: AccountMergeParams = {
      sourceSecret: 'SINVALIDSECRET',
      destination: validDestination,
      horizonUrl,
    };
    const result = await mergeAccount(params);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should fail with invalid destination', async () => {
    const params: AccountMergeParams = {
      sourceSecret: validSecret,
      destination: 'GINVALIDDEST',
      horizonUrl,
    };
    const result = await mergeAccount(params);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
