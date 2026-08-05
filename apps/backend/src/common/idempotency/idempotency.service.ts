import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { DataSource } from 'typeorm';
import { ErrorCode } from '../errors/error-code';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { TenantContextService } from '../tenancy/tenant-context';
import { IdempotencyKeyOrmEntity } from './idempotency-key.orm-entity';

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
      .update(JSON.stringify(input))
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
