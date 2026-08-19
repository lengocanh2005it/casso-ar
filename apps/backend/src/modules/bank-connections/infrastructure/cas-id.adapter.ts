import { Injectable, Logger } from '@nestjs/common';
import {
  type CasIdTransaction,
  CasIdUnauthorizedError,
  type ICasIdIntegrationAdapter,
} from '../application/cas-id-integration-adapter.port';
import type { AccountIdentity } from '../domain/bank-connection';

const DEFAULT_BASE_URL = 'https://sandbox.bankhub.dev';
const API_VERSION = '2023-01-01';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

class CasIdHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CasIdHttpError';
  }
}

// ponytail: real HTTP calls only for createGrantToken/exchangeToken/
// getAccountIdentity. invalidateToken and getTransactions keep
// MockCasIdAdapter's no-op behavior — /grant/invalidate and /transactions'
// request/response schemas are not in Cas ID's public docs (stub pages,
// checked 2026-08-19) and DisconnectConnectionUseCase rethrows any error
// from invalidateToken, so guessing the schema risks breaking the existing,
// working Disconnect feature. Upgrade once a real schema is confirmed —
// see docs/superpowers/specs/2026-08-19-cas-id-real-integration-design.md §2.1.
@Injectable()
export class CasIdAdapter implements ICasIdIntegrationAdapter {
  private readonly logger = new Logger(CasIdAdapter.name);
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly secretKey: string;

  constructor() {
    this.baseUrl = process.env.CAS_ID_BASE_URL ?? DEFAULT_BASE_URL;
    this.clientId = process.env.CAS_ID_CLIENT_ID ?? '';
    this.secretKey = process.env.CAS_ID_CLIENT_SECRET ?? '';
  }

  async createGrantToken(
    scopes: string[],
    redirectUri: string,
  ): Promise<{ grantToken: string; expiresAt: Date }> {
    const data = await this.request<Record<string, unknown>>('/grant/token', {
      method: 'POST',
      body: JSON.stringify({
        scopes: scopes.join(','),
        language: 'vi',
        redirectUri,
      }),
    });
    const grantToken = data.grantToken ?? data.grant_token;
    if (typeof grantToken !== 'string' || !grantToken) {
      throw new Error('Cas ID /grant/token response is missing grantToken');
    }
    const expiresAtRaw = data.expiresAt ?? data.expires_at;
    const expiresAt =
      typeof expiresAtRaw === 'string'
        ? new Date(expiresAtRaw)
        : new Date(Date.now() + 30 * 60 * 1000);
    return { grantToken, expiresAt };
  }

  async exchangeToken(
    publicToken: string,
  ): Promise<{ accessToken: string; grantId: string }> {
    const data = await this.request<Record<string, unknown>>(
      '/grant/exchange',
      { method: 'POST', body: JSON.stringify({ publicToken }) },
    );
    const accessToken = data.accessToken ?? data.access_token;
    const grantId = data.grantId ?? data.grant_id;
    if (typeof accessToken !== 'string' || !accessToken) {
      throw new Error('Cas ID /grant/exchange response is missing accessToken');
    }
    if (typeof grantId !== 'string' || !grantId) {
      throw new Error('Cas ID /grant/exchange response is missing grantId');
    }
    return { accessToken, grantId };
  }

  async invalidateToken(_accessToken: string): Promise<void> {}

  async getAccountIdentity(accessToken: string): Promise<AccountIdentity> {
    const data = await this.request<Record<string, unknown>>(
      '/identity',
      { method: 'GET' },
      accessToken,
    );
    const accountNumber = data.accountNumber ?? data.account_number;
    const bankName = data.bankName ?? data.bank_name;
    if (typeof accountNumber !== 'string' || !accountNumber) {
      throw new Error('Cas ID /identity response is missing accountNumber');
    }
    if (typeof bankName !== 'string' || !bankName) {
      throw new Error('Cas ID /identity response is missing bankName');
    }
    return { ...data, accountNumber, bankName };
  }

  async getTransactions(_accessToken: string): Promise<CasIdTransaction[]> {
    return [];
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    accessToken?: string,
  ): Promise<T> {
    return this.withRetry(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}${path}`, {
          ...init,
          signal: controller.signal,
          headers: {
            'x-client-id': this.clientId,
            'x-secret-key': this.secretKey,
            'X-BankHub-Api-Version': API_VERSION,
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: accessToken } : {}),
          },
        });
      } finally {
        clearTimeout(timeout);
      }

      const data: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new CasIdUnauthorizedError();
        }
        throw new CasIdHttpError(
          this.extractErrorMessage(data, response.status),
          response.status,
        );
      }

      return this.unwrap(data) as T;
    }, path);
  }

  private unwrap(data: unknown): unknown {
    if (typeof data !== 'object' || data === null) return data;
    const record = data as Record<string, unknown>;
    if (typeof record.data === 'object' && record.data !== null) {
      return record.data;
    }
    return record;
  }

  private extractErrorMessage(data: unknown, status: number): string {
    if (typeof data === 'object' && data !== null) {
      const record = data as Record<string, unknown>;
      const message =
        record.errorMessage ??
        record.message ??
        record.error ??
        record.errorCode;
      if (message) return String(message);
    }
    return `Cas ID API error ${status}`;
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    context: string,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const isRetryable =
          error instanceof CasIdHttpError &&
          RETRYABLE_STATUS_CODES.has(error.status);
        if (!isRetryable || attempt === MAX_RETRIES) throw error;
        const delayMs = RETRY_BASE_DELAY_MS * 2 ** attempt;
        this.logger.warn(
          `Cas ID ${context} attempt ${attempt + 1} failed (status ${(error as CasIdHttpError).status}), retrying in ${delayMs}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw lastError;
  }
}
