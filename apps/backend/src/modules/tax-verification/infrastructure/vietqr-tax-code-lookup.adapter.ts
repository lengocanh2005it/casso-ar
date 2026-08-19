import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import type {
  ITaxCodeLookupAdapter,
  TaxCodeLookupResult,
} from '../application/tax-code-lookup.port';
import { REDIS_CLIENT } from './redis-client.provider';

const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const LOOKUP_TIMEOUT_MS = 5000;

@Injectable()
export class VietQrTaxCodeLookupAdapter implements ITaxCodeLookupAdapter {
  private readonly logger = new Logger(VietQrTaxCodeLookupAdapter.name);
  private readonly baseUrl: string;

  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.baseUrl = this.config.get<string>(
      'VIETQR_API_BASE_URL',
      'https://api.vietqr.io/v2/business',
    );
  }

  async lookup(taxCode: string): Promise<TaxCodeLookupResult | null> {
    const cacheKey = `tax-code-lookup:${taxCode}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as TaxCodeLookupResult;
    } catch (error) {
      this.logger.warn('Tax code lookup cache read failed', {
        taxCode,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
      try {
        response = await fetch(`${this.baseUrl}/${taxCode}`, {
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      this.logger.warn('Tax code lookup request failed', {
        taxCode,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }

    if (!response.ok) {
      this.logger.warn('Tax code lookup returned a non-OK status', {
        taxCode,
        status: response.status,
      });
      return null;
    }

    let body: { name?: unknown };
    try {
      body = await response.json();
    } catch {
      return null;
    }
    if (typeof body.name !== 'string' || body.name.trim() === '') return null;

    const result: TaxCodeLookupResult = { name: body.name };
    try {
      await this.redis.set(
        cacheKey,
        JSON.stringify(result),
        'EX',
        CACHE_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn('Tax code lookup cache write failed', {
        taxCode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return result;
  }
}
