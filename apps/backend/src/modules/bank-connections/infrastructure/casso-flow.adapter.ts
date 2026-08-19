import { Injectable, Logger } from '@nestjs/common';
import {
  type CassoFlowAccountInfo,
  CassoFlowUnauthorizedError,
  type ICassoFlowIntegrationAdapter,
} from '../application/casso-flow-integration-adapter.port';

const OAUTH_BASE_URL = 'https://oauth.casso.vn';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

class CassoFlowHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CassoFlowHttpError';
  }
}

// ponytail: invalidateToken and getTransactions are stubs (no-op / empty
// array) — this session's implementation only covers connect+receive (see
// spec §6 "Out of scope"). Disconnect-side webhook unregistration and the
// /v2/sync reconciliation call are deliberate follow-ups, not guesses.
@Injectable()
export class CassoFlowAdapter implements ICassoFlowIntegrationAdapter {
  private readonly logger = new Logger(CassoFlowAdapter.name);
  private readonly webhookUrl: string;

  constructor() {
    this.webhookUrl = process.env.CASSO_FLOW_WEBHOOK_URL ?? '';
  }

  async getAccountInfo(apiKey: string): Promise<CassoFlowAccountInfo> {
    const data = await this.request<Record<string, unknown>>(
      '/v2/userInfo',
      { method: 'GET' },
      apiKey,
    );
    const payload = this.unwrap(data);
    const accountNumber = payload.accountNumber;
    const bankName = payload.bankName;
    if (typeof accountNumber !== 'string' || !accountNumber) {
      throw new Error(
        'Casso Flow /v2/userInfo response is missing accountNumber',
      );
    }
    if (typeof bankName !== 'string' || !bankName) {
      throw new Error('Casso Flow /v2/userInfo response is missing bankName');
    }
    return { accountNumber, bankName };
  }

  async registerWebhook(apiKey: string, secureToken: string): Promise<void> {
    await this.request(
      '/v2/webhooks',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhook: this.webhookUrl,
          secure_token: secureToken,
          income_only: true,
        }),
      },
      apiKey,
    );
  }

  async invalidateToken(_apiKey: string): Promise<void> {}

  async getTransactions(_apiKey: string): Promise<unknown[]> {
    return [];
  }

  private unwrap(data: Record<string, unknown>): Record<string, unknown> {
    if (typeof data.data === 'object' && data.data !== null) {
      return data.data as Record<string, unknown>;
    }
    return data;
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    apiKey: string,
  ): Promise<T> {
    return this.withRetry(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(`${OAUTH_BASE_URL}${path}`, {
          ...init,
          signal: controller.signal,
          headers: {
            ...init.headers,
            Authorization: `Apikey ${apiKey}`,
          },
        });
      } finally {
        clearTimeout(timeout);
      }

      const data: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new CassoFlowUnauthorizedError();
        }
        throw new CassoFlowHttpError(
          `Casso Flow API error ${response.status}`,
          response.status,
        );
      }

      return data as T;
    }, path);
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
          error instanceof CassoFlowHttpError &&
          RETRYABLE_STATUS_CODES.has(error.status);
        if (!isRetryable || attempt === MAX_RETRIES) throw error;
        const delayMs = RETRY_BASE_DELAY_MS * 2 ** attempt;
        this.logger.warn(
          `Casso Flow ${context} attempt ${attempt + 1} failed, retrying in ${delayMs}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw lastError;
  }
}
