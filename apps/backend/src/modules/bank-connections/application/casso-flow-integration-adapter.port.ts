export interface CassoFlowBankAccount {
  accountNumber: string;
  bankName: string;
  accountHolderName: string;
}

export interface CassoFlowAccountInfo {
  businessId: string;
  accounts: CassoFlowBankAccount[];
}

export interface ICassoFlowIntegrationAdapter {
  getAccountInfo(apiKey: string): Promise<CassoFlowAccountInfo>;
  registerWebhook(apiKey: string, secureToken: string): Promise<void>;
  invalidateToken(apiKey: string): Promise<void>;
  getTransactions(apiKey: string): Promise<unknown[]>;
}

export const CASSO_FLOW_INTEGRATION_ADAPTER = Symbol(
  'CASSO_FLOW_INTEGRATION_ADAPTER',
);

export class CassoFlowUnauthorizedError extends Error {
  constructor() {
    super(
      'Casso Flow API Key rejected (401/403) — connection requires reauthorization',
    );
    this.name = 'CassoFlowUnauthorizedError';
  }
}
