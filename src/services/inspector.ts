import { Transaction, FeeBumpTransaction, TransactionBuilder, Operation, BASE_FEE, Asset } from "@stellar/stellar-sdk";

export enum RiskLevel {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
}

export interface Finding {
  level: RiskLevel;
  type: string;
  message: string;
}

export interface InspectionReport {
  is_safe: boolean;
  risk_level: RiskLevel;
  findings: Finding[];
  operation_count: number;
  total_fee: string;
  summary: string;
  [key: string]: unknown;
}

/**
 * XdrInspector parses and analyzes Stellar transactions for potential security risks.
 */
export class XdrInspector {
  private findings: Finding[] = [];

  constructor(private readonly tx: Transaction | FeeBumpTransaction) {}

  /**
   * Performs a full inspection of the transaction.
   */
  inspect(): InspectionReport {
    this.findings = [];
    
    const innerTx = this.tx instanceof FeeBumpTransaction ? this.tx.innerTransaction : this.tx;
    const operations = innerTx.operations;

    // Rule 1: Excessive Fees
    this.checkFees();

    // Rule 2: Inspect individual operations
    for (const op of operations) {
      this.inspectOperation(op);
    }

    // Determine overall risk level
    const riskLevel = this.calculateOverallRisk();

    return {
      is_safe: riskLevel === RiskLevel.LOW,
      risk_level: riskLevel,
      findings: this.findings,
      operation_count: operations.length,
      total_fee: this.tx.fee,
      summary: this.generateSummary(operations),
    };
  }

  private checkFees() {
    const fee = BigInt(this.tx.fee);
    const opCount = BigInt(this.tx instanceof FeeBumpTransaction ? this.tx.innerTransaction.operations.length : this.tx.operations.length);
    const baseFee = BigInt(BASE_FEE);
    
    // Flag if fee is > 100x the base fee per operation (a common safety threshold)
    if (fee > baseFee * opCount * 100n) {
      this.findings.push({
        level: RiskLevel.MEDIUM,
        type: "EXCESSIVE_FEE",
        message: `The transaction fee (${fee} stroops) is unusually high for ${opCount} operations.`,
      });
    }
  }

  private inspectOperation(op: Operation) {
    switch (op.type) {
      case "accountMerge":
        this.findings.push({
          level: RiskLevel.HIGH,
          type: "ACCOUNT_MERGE",
          message: `DANGEROUS: This operation will permanently delete account ${op.source || 'the source'} and move all funds to ${op.destination}.`,
        });
        break;

      case "setOptions":
        if (op.signer) {
          this.findings.push({
            level: RiskLevel.HIGH,
            type: "SIGNER_CHANGE",
            message: `CRITICAL: This operation adds or modifies a signer for the account. This can lead to account takeover.`,
          });
        }
        if (op.masterWeight !== undefined || op.lowThreshold !== undefined || op.medThreshold !== undefined || op.highThreshold !== undefined) {
          this.findings.push({
            level: RiskLevel.MEDIUM,
            type: "THRESHOLD_CHANGE",
            message: `Warning: This operation changes account thresholds or master weight.`,
          });
        }
        break;

      case "changeTrust": {
        const line = op.line;
        let assetLabel = "Unknown Asset";
        if (line instanceof Asset) {
          if (line.isNative()) {
            assetLabel = "XLM";
          } else {
            assetLabel = `${line.getCode()}:${line.getIssuer()}`;
          }
        } else {
          assetLabel = "Liquidity Pool Asset";
        }
        
        this.findings.push({
          level: RiskLevel.LOW,
          type: "TRUSTLINE_CHANGE",
          message: `This operation creates or modifies a trustline to ${assetLabel}.`,
        });
        break;
      }

      case "allowTrust":
      case "setTrustLineFlags":
        this.findings.push({
          level: RiskLevel.MEDIUM,
          type: "PERMISSION_CHANGE",
          message: `Warning: This operation modifies trustline flags or permissions for account ${op.trustor}.`,
        });
        break;

      case "manageData":
        this.findings.push({
          level: RiskLevel.MEDIUM,
          type: "DATA_CHANGE",
          message: `Warning: This operation modifies account data for key "${op.name}".`,
        });
        break;

      case "revokeSponsorship":
        this.findings.push({
          level: RiskLevel.MEDIUM,
          type: "REVOKE_SPONSORSHIP",
          message: `Warning: This operation revokes sponsorship for an account or ledger entry.`,
        });
        break;

      case "clawback":
        this.findings.push({
          level: RiskLevel.HIGH,
          type: "CLAWBACK",
          message: `CRITICAL: This operation performs a clawback of tokens from ${op.from}.`,
        });
        break;
    }
  }

  private calculateOverallRisk(): RiskLevel {
    if (this.findings.some(f => f.level === RiskLevel.HIGH)) return RiskLevel.HIGH;
    if (this.findings.some(f => f.level === RiskLevel.MEDIUM)) return RiskLevel.MEDIUM;
    return RiskLevel.LOW;
  }

  private generateSummary(operations: Operation[]): string {
    if (operations.length === 0) return "Empty transaction.";
    const types = operations.map(op => op.type);
    const uniqueTypes = [...new Set(types)];
    return `Transaction with ${operations.length} operation(s): ${uniqueTypes.join(", ")}.`;
  }
}
