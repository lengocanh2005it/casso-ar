import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { deleteOlderThan } from '../database/delete-older-than';
import { isUniqueViolation } from '../database/unique-violation';
import { ErrorCode } from '../errors/error-code';
import { TenantContextService } from '../tenancy/tenant-context';
import { IdempotencyKeyOrmEntity } from './idempotency-key.orm-entity';

// ADR-0015: a PENDING row older than this is presumed abandoned (crashed
// process) and is reclaimed instead of blocking retries forever. Reused by
// both the request-time reclaim in execute() and the retention job's
// sweepStalePending() backstop — do not introduce a second threshold.
export const IDEMPOTENCY_STALE_PENDING_MS = 5 * 60 * 1000;

function canonicalize(obj: unknown): string {
  if (obj === undefined) return 'undefined';
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalize).join(',')}]`;
  }
  const sorted = Object.keys(obj).sort();
  return `{${sorted.map((k) => `${JSON.stringify(k)}:${canonicalize((obj as Record<string, unknown>)[k])}`).join(',')}}`;
}

@Injectable()
export class IdempotencyService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute<T>(
    endpoint: string,
    key: string | undefined,
    input: unknown,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (!key?.trim()) {
      throw new ConflictException({
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: 'Vui lòng cung cấp Idempotency-Key.',
      });
    }
    const organizationId = this.tenantContext.getOrganizationId();
    const requestHash = createHash('sha256')
      .update(canonicalize(input))
      .digest('hex');
    let existing: T | undefined;
    try {
      existing = await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(IdempotencyKeyOrmEntity);
        const found = await repo.findOne({
          where: { organizationId, endpoint, key },
        });
        if (found) {
          if (found.requestHash !== requestHash) {
            throw new ConflictException({
              errorCode: ErrorCode.IDEMPOTENCY_KEY_REUSED,
              message: 'Idempotency-Key đã được dùng cho dữ liệu khác.',
            });
          }
          if (found.status === 'COMPLETED') return found.response as T;
          const ageMs = Date.now() - found.createdAt.getTime();
          if (ageMs < IDEMPOTENCY_STALE_PENDING_MS) {
            throw new ConflictException({
              errorCode: ErrorCode.CONFLICT,
              message: 'Yêu cầu với Idempotency-Key này đang được xử lý.',
            });
          }
          // PENDING row is stale (ADR-0015): the process that created it is
          // presumed dead. Reclaim by deleting it and falling through to
          // insert a fresh PENDING row below.
          await repo.delete({ id: found.id });
        }
        await repo.save({
          id: randomUUID(),
          organizationId,
          endpoint,
          key,
          requestHash,
          status: 'PENDING',
          response: null,
          createdAt: new Date(),
        });
        return undefined;
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return this.execute(endpoint, key, input, operation);
    }
    if (existing !== undefined) return existing;

    try {
      const result = await operation();
      await this.dataSource.transaction(async (manager) => {
        await manager.update(
          IdempotencyKeyOrmEntity,
          { organizationId, endpoint, key, requestHash },
          { status: 'COMPLETED', response: result as Record<string, unknown> },
        );
      });
      return result;
    } catch (error) {
      await this.dataSource.transaction(async (manager) => {
        await manager.delete(IdempotencyKeyOrmEntity, {
          organizationId,
          endpoint,
          key,
          requestHash,
        });
      });
      throw error;
    }
  }

  async deleteCompletedOlderThan(cutoff: Date): Promise<number> {
    return deleteOlderThan(
      this.dataSource.getRepository(IdempotencyKeyOrmEntity),
      'createdAt',
      cutoff,
      { status: 'COMPLETED' },
    );
  }

  async sweepStalePending(): Promise<number> {
    const cutoff = new Date(Date.now() - IDEMPOTENCY_STALE_PENDING_MS);
    return deleteOlderThan(
      this.dataSource.getRepository(IdempotencyKeyOrmEntity),
      'createdAt',
      cutoff,
      { status: 'PENDING' },
    );
  }
}
