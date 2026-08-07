import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ErrorCode } from '../errors/error-code';
import { TenantContextService } from '../tenancy/tenant-context';
import { IdempotencyKeyOrmEntity } from './idempotency-key.orm-entity';

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
    const existing = await this.dataSource.transaction(async (manager) => {
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
        throw new ConflictException({
          errorCode: ErrorCode.CONFLICT,
          message: 'Yêu cầu với Idempotency-Key này đang được xử lý.',
        });
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
}
