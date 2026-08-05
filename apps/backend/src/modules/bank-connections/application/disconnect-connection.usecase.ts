import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
import {
  CAS_ID_INTEGRATION_ADAPTER,
  CasIdUnauthorizedError,
  type ICasIdIntegrationAdapter,
} from './cas-id-integration-adapter.port';
import {
  CONNECTION_AUDIT_EVENT_REPOSITORY,
  type IConnectionAuditEventRepository,
} from './connection-audit-event-repository.port';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { MarkRequiresReauthorizationUseCase } from './mark-requires-reauthorization.usecase';
import { decryptToken } from './token-encryption';

@Injectable()
export class DisconnectConnectionUseCase {
  constructor(
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CAS_ID_INTEGRATION_ADAPTER)
    private readonly adapter: ICasIdIntegrationAdapter,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
    private readonly markRequiresReauthorization: MarkRequiresReauthorizationUseCase,
    private readonly dataSource: DataSource,
  ) {}

  async execute(connectionId: string): Promise<void> {
    const connection = await this.bankConnectionRepo.findById(connectionId);
    if (!connection)
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy kết nối ngân hàng.',
      );
    // External call stays outside the transaction — only the DB writes below are wrapped.
    try {
      await this.adapter.invalidateToken(
        decryptToken(connection.encryptedAccessToken),
      );
    } catch (error) {
      if (error instanceof CasIdUnauthorizedError) {
        await this.markRequiresReauthorization.execute(
          connectionId,
          '401/403 from invalidateToken',
        );
      }
      throw error;
    }
    await this.dataSource.transaction(async (manager) => {
      await this.bankConnectionRepo.save(connection.disconnect(), manager);
      await this.auditEventRepo.save(
        new ConnectionAuditEvent({
          id: randomUUID(),
          bankConnectionId: connectionId,
          eventType: 'DISCONNECTED',
          metadata: {},
          createdAt: new Date(),
        }),
        manager,
      );
    });
  }
}
