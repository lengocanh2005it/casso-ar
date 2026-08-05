import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  type CasIdTransaction,
  CasIdUnauthorizedError,
  type ICasIdIntegrationAdapter,
} from '../application/cas-id-integration-adapter.port';
import type { AccountIdentity } from '../domain/bank-connection';

const GRANT_TOKEN_TTL_MS = 30 * 60 * 1000;

// ponytail: deterministic mock until Cas ID Developer Portal schemas are available.
@Injectable()
export class MockCasIdAdapter implements ICasIdIntegrationAdapter {
  async createGrantToken(
    _scopes: string[],
    _redirectUri: string,
  ): Promise<{ grantToken: string; expiresAt: Date }> {
    return {
      grantToken: `mock-grant-token-${randomUUID()}`,
      expiresAt: new Date(Date.now() + GRANT_TOKEN_TTL_MS),
    };
  }

  async exchangeToken(_publicToken: string): Promise<{ accessToken: string }> {
    return { accessToken: `mock-access-token-${randomUUID()}` };
  }

  async invalidateToken(_accessToken: string): Promise<void> {}

  async getAccountIdentity(accessToken: string): Promise<AccountIdentity> {
    if (accessToken === 'revoked-token') throw new CasIdUnauthorizedError();
    return { accountNumber: '0011002233', bankName: 'Mock Bank' };
  }

  async getTransactions(accessToken: string): Promise<CasIdTransaction[]> {
    if (accessToken === 'revoked-token') throw new CasIdUnauthorizedError();
    return [];
  }
}
