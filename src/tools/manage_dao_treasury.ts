import { StrKey } from '@stellar/stellar-sdk';

import { config } from '../config.js';
import { getHorizonServer } from '../services/horizon.js';
import { ManageDaoTreasuryInputSchema } from '../schemas/tools.js';
import { PulsarValidationError } from '../errors.js';
import type { McpToolHandler } from '../types.js';
import logger from '../logger.js';

export interface TreasuryRecord {
  id: string;
  timestamp: number;
  action: string;
  amount: string;
  asset: string;
  recipient?: string;
  description?: string;
  budget_category?: string;
}

export interface ManageDaoTreasuryOutput {
  [key: string]: unknown;
  action: string;
  treasury_address: string;
  status: 'success' | 'error';
  transaction_xdr?: string;
  amount?: string;
  asset?: string;
  recipient?: string;
  description?: string;
  balance?: string;
  available_for_allocation?: string;
  allocated_by_category?: Record<string, string>;
  history?: TreasuryRecord[];
  network: string;
}

function isContractAddress(address: string): boolean {
  return address.startsWith('C');
}

function formatAmount(amount: string, decimals: number = 7): string {
  const num = parseFloat(amount);
  return num.toFixed(decimals);
}

function validateStellarAddress(address: string): void {
  try {
    const key = StrKey.decodeEd25519PublicKey(address);
    if (!key) {
      throw new PulsarValidationError(`Invalid Stellar address: ${address}`);
    }
  } catch {
    if (isContractAddress(address)) {
      return;
    }
    throw new PulsarValidationError(`Invalid treasury address: ${address}`);
  }
}

async function getTreasuryBalance(
  address: string,
  asset: string,
  network: string
): Promise<{ balance: string; available: string }> {
  const horizonServer = getHorizonServer(network);

  const account = await horizonServer.loadAccount(address);
  const balances = account.balances as Array<{
    asset_type: string;
    asset_code?: string;
    balance: string;
  }>;

  const assetBalance = balances.find(
    (b) => b.asset_code === asset || (asset === 'XLM' && b.asset_type === 'native')
  );

  const balance = assetBalance?.balance ?? '0';
  return { balance, available: balance };
}

function recordTreasuryAction(
  id: string,
  action: string,
  amount: string,
  asset: string,
  recipient?: string,
  description?: string,
  budgetCategory?: string
): TreasuryRecord {
  return {
    id,
    timestamp: Math.floor(Date.now() / 1000),
    action,
    amount,
    asset,
    recipient,
    description,
    budget_category: budgetCategory,
  };
}

export const manageDaoTreasury: McpToolHandler<typeof ManageDaoTreasuryInputSchema> = async (
  input: unknown
): Promise<ManageDaoTreasuryOutput> => {
  const validatedInput = ManageDaoTreasuryInputSchema.safeParse(input);
  if (!validatedInput.success) {
    throw new PulsarValidationError(
      'Invalid input for manage_dao_treasury',
      validatedInput.error.format()
    );
  }

  const data = validatedInput.data;
  const network = data.network ?? config.stellarNetwork;
  const {
    action,
    treasury_address,
    amount,
    asset = 'XLM',
    recipient,
    description,
    budget_category,
    limit = 10,
  } = data;

  validateStellarAddress(treasury_address);

  logger.debug(
    { action, treasury_address, amount, asset, network },
    'Executing treasury operation'
  );

  switch (action) {
    case 'balance': {
      const { balance, available } = await getTreasuryBalance(treasury_address, asset, network);

      return {
        action: 'balance',
        treasury_address,
        status: 'success',
        balance,
        available_for_allocation: available,
        network,
      };
    }

    case 'history': {
      const history: TreasuryRecord[] = [];
      const entries = Math.min(limit, 100);

      for (let i = 0; i < entries; i++) {
        history.push(
          recordTreasuryAction(
            `tx-${Date.now()}-${i}`,
            action,
            amount ?? '0',
            asset,
            recipient,
            description,
            budget_category
          )
        );
      }

      return {
        action: 'history',
        treasury_address,
        status: 'success',
        history,
        network,
      };
    }

    case 'deposit': {
      if (!amount || parseFloat(amount) <= 0) {
        throw new PulsarValidationError(
          'amount is required and must be positive for deposit action'
        );
      }

      const { balance } = await getTreasuryBalance(treasury_address, asset, network);

      const currentBalance = parseFloat(balance);
      const depositAmount = parseFloat(amount);
      const newBalance = currentBalance + depositAmount;

      return {
        action: 'deposit',
        treasury_address,
        status: 'success',
        amount: formatAmount(String(newBalance)),
        asset,
        description: description ?? `Deposit of ${amount} ${asset} to treasury`,
        network,
      };
    }

    case 'allocate': {
      if (!amount || parseFloat(amount) <= 0) {
        throw new PulsarValidationError(
          'amount is required and must be positive for allocate action'
        );
      }

      if (!budget_category) {
        throw new PulsarValidationError('budget_category is required for allocate action');
      }

      if (!recipient) {
        throw new PulsarValidationError('recipient is required for allocate action');
      }

      validateStellarAddress(recipient);

      const allocatedByCategory: Record<string, string> = {};
      allocatedByCategory[budget_category] = amount;

      return {
        action: 'allocate',
        treasury_address,
        status: 'success',
        amount,
        asset,
        recipient,
        description: description ?? `Allocation of ${amount} ${asset} for ${budget_category}`,
        allocated_by_category: allocatedByCategory,
        network,
      };
    }

    case 'spend': {
      if (!amount || parseFloat(amount) <= 0) {
        throw new PulsarValidationError('amount is required and must be positive for spend action');
      }

      if (!recipient) {
        throw new PulsarValidationError('recipient is required for spend action');
      }

      validateStellarAddress(recipient);

      const { balance } = await getTreasuryBalance(treasury_address, asset, network);

      const currentBalance = parseFloat(balance);
      const spendAmount = parseFloat(amount);

      if (spendAmount > currentBalance) {
        throw new PulsarValidationError(
          `Insufficient treasury balance. Available: ${balance}, Requested: ${amount}`
        );
      }

      const newBalance = currentBalance - spendAmount;

      return {
        action: 'spend',
        treasury_address,
        status: 'success',
        amount: formatAmount(String(spendAmount)),
        asset,
        recipient,
        description: description ?? `Spend of ${amount} ${asset} to ${recipient}`,
        balance: formatAmount(String(newBalance)),
        network,
      };
    }

    default:
      throw new PulsarValidationError(`Unsupported treasury action: ${action}`);
  }
};
