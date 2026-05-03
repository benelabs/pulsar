import { 
  Address, 
  Contract, 
  TransactionBuilder, 
  nativeToScVal,
  Account,
  Networks
} from "@stellar/stellar-sdk";
import { EstimateTokenFeesInput } from "../schemas/tools.js";
import { simulateTransaction } from "./simulate_transaction.js";
import { PulsarError } from "../errors.js";
import { config } from "../config.js";

/**
 * Estimates Soroban resource costs for SAC mint/burn operations.
 * 
 * It constructs a transaction for the specified operation and then 
 * leverages the existing simulate_transaction tool to get actual 
 * resource usage from the Soroban RPC.
 * 
 * SAC methods:
 * - mint(to: Address, amount: i128)
 * - burn(from: Address, amount: i128)
 */
export async function estimateTokenFees(input: EstimateTokenFeesInput) {
  const { contract_id, amount, address, op, source_account, network: networkOverride } = input;

  try {
    // 1. Construct the contract call
    const contract = new Contract(contract_id);
    
    // Convert amount to BigInt if possible
    let amountBigInt: bigint;
    try {
      amountBigInt = BigInt(amount);
    } catch (e) {
      throw new PulsarError("INVALID_AMOUNT", "Amount must be a valid integer string for i128");
    }

    // Prepare arguments for mint(to: Address, amount: i128) or burn(from: Address, amount: i128)
    const args = [
      new Address(address).toScVal(),
      nativeToScVal(amountBigInt, { type: 'i128' })
    ];

    const operation = contract.call(op, ...args);

    // 2. Build a dummy transaction for simulation
    // Simulation doesn't require a valid sequence number for resource estimation,
    // but it needs a valid source account.
    const dummyAccount = new Account(source_account, "0");
    
    // Select network passphrase
    const network = networkOverride || config.stellarNetwork;
    let passphrase = Networks.TESTNET;
    if (network === 'mainnet') passphrase = Networks.PUBLIC;
    else if (network === 'futurenet') passphrase = "Test SDF Future Network ; October 2022";

    const tx = new TransactionBuilder(dummyAccount, {
      fee: "100", // minimal fee for simulation
      networkPassphrase: passphrase,
    })
    .addOperation(operation)
    .setTimeout(0)
    .build();

    const xdr = tx.toXDR();

    // 3. Delegate to simulateTransaction
    return await simulateTransaction({
      xdr,
      network: networkOverride
    });
  } catch (error) {
    if (error instanceof PulsarError) throw error;
    throw new PulsarError(
      "ESTIMATION_FAILED", 
      `Failed to estimate token fees: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}