# Account Merge Helper Tool

Safely construct and submit Stellar account merge transactions using Pulsar's backend toolset.

## Usage

```
import { mergeAccount, AccountMergeParams } from './account_merge';

const params: AccountMergeParams = {
  sourceSecret: 'S...source...',
  destination: 'G...destination...',
  horizonUrl: 'https://horizon-testnet.stellar.org',
};

const result = await mergeAccount(params);
if (result.success) {
  console.log('Merged! Hash:', result.txHash);
} else {
  console.error('Merge failed:', result.error);
}
```

## API

### `mergeAccount(params: AccountMergeParams): Promise<AccountMergeResult>`

- `sourceSecret`: Secret key of the account to merge (string)
- `destination`: Public key of the destination account (string)
- `horizonUrl`: Horizon server URL (string)

Returns:
- `{ success: boolean, txHash?: string, error?: string }`

## Testing

Unit and integration tests are in `src/tools/account_merge.test.ts`.

## Security & Best Practices
- Uses Stellar SDK and Pulsar's transaction submission flow
- Handles errors and logs diagnostics
- Follows Stellar/Soroban best practices

---

*See also: [Stellar Account Merge Operation](https://developers.stellar.org/docs/fundamentals-and-concepts/list-of-operations/#account-merge)*
