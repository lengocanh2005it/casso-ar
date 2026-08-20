import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EVENT_PUBLISHER } from '../../common/events/event-publisher.port';
import { NestEventPublisherAdapter } from '../../common/events/nest-event-publisher.adapter';
import { BillingModule } from '../billing/billing.module';
import { BANK_CONNECTION_REPOSITORY } from './application/bank-connection-repository.port';
import { CASSO_FLOW_INTEGRATION_ADAPTER } from './application/casso-flow-integration-adapter.port';
import { ConnectCassoFlowUseCase } from './application/connect-casso-flow.usecase';
import { CONNECTION_AUDIT_EVENT_REPOSITORY } from './application/connection-audit-event-repository.port';
import { DisconnectConnectionUseCase } from './application/disconnect-connection.usecase';
import { ListBankConnectionsUseCase } from './application/list-bank-connections.usecase';
import { MarkRequiresReauthorizationUseCase } from './application/mark-requires-reauthorization.usecase';
import { SyncTransactionsUseCase } from './application/sync-transactions.usecase';
import { ACCESS_TOKEN_ENCRYPTION_KEY } from './application/token-encryption-key';
import { BankConnectionOrmEntity } from './infrastructure/bank-connection.orm-entity';
import { CassoFlowAdapter } from './infrastructure/casso-flow.adapter';
import { ConnectionAuditEventOrmEntity } from './infrastructure/connection-audit-event.orm-entity';
import { TypeOrmBankConnectionRepository } from './infrastructure/typeorm-bank-connection.repository';
import { TypeOrmConnectionAuditEventRepository } from './infrastructure/typeorm-connection-audit-event.repository';
import { BankConnectionsController } from './presentation/bank-connections.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BankConnectionOrmEntity,
      ConnectionAuditEventOrmEntity,
    ]),
    BillingModule,
  ],
  controllers: [BankConnectionsController],
  providers: [
    {
      provide: BANK_CONNECTION_REPOSITORY,
      useClass: TypeOrmBankConnectionRepository,
    },
    {
      provide: CONNECTION_AUDIT_EVENT_REPOSITORY,
      useClass: TypeOrmConnectionAuditEventRepository,
    },
    {
      provide: CASSO_FLOW_INTEGRATION_ADAPTER,
      useClass: CassoFlowAdapter,
    },
    { provide: EVENT_PUBLISHER, useClass: NestEventPublisherAdapter },
    {
      provide: ACCESS_TOKEN_ENCRYPTION_KEY,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const key = config.getOrThrow<string>('ACCESS_TOKEN_ENCRYPTION_KEY');
        if (key.trim() === '') {
          throw new Error('ACCESS_TOKEN_ENCRYPTION_KEY must not be empty');
        }
        return key;
      },
    },
    ConnectCassoFlowUseCase,
    DisconnectConnectionUseCase,
    ListBankConnectionsUseCase,
    MarkRequiresReauthorizationUseCase,
    SyncTransactionsUseCase,
  ],
  exports: [
    BANK_CONNECTION_REPOSITORY,
    CASSO_FLOW_INTEGRATION_ADAPTER,
    ACCESS_TOKEN_ENCRYPTION_KEY,
    ConnectCassoFlowUseCase,
    DisconnectConnectionUseCase,
    ListBankConnectionsUseCase,
    MarkRequiresReauthorizationUseCase,
    SyncTransactionsUseCase,
  ],
})
export class BankConnectionsModule {}
