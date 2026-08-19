import type { AccountIdentity } from '../domain/bank-connection';

export interface CasIdTransaction {
  transactionId: string;
  amount: number;
  transactionDateTime: string;
  counterpartyAccountNumber: string;
  counterpartyName: string;
  transferContent: string;
}

export interface ICasIdIntegrationAdapter {
  createGrantToken(
    scopes: string[],
    redirectUri: string,
  ): Promise<{ grantToken: string; expiresAt: Date }>;
  exchangeToken(
    publicToken: string,
  ): Promise<{ accessToken: string; grantId: string }>;
  invalidateToken(accessToken: string): Promise<void>;
  getAccountIdentity(accessToken: string): Promise<AccountIdentity>;
  getTransactions(accessToken: string): Promise<CasIdTransaction[]>;
}

export const CAS_ID_INTEGRATION_ADAPTER = Symbol('CAS_ID_INTEGRATION_ADAPTER');

export class CasIdUnauthorizedError extends Error {
  constructor() {
    super(
      'Cas ID access token rejected (401/403) — connection requires reauthorization',
    );
    this.name = 'CasIdUnauthorizedError';
  }
}
