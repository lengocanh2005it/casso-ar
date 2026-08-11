import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BANK_CONNECTION_REPOSITORY } from './application/bank-connection-repository.port';
import { CAS_ID_CONNECTION_SESSION_REPOSITORY } from './application/cas-id-connection-session-repository.port';
import { CAS_ID_INTEGRATION_ADAPTER } from './application/cas-id-integration-adapter.port';
import { CONNECTION_AUDIT_EVENT_REPOSITORY } from './application/connection-audit-event-repository.port';
import { DisconnectConnectionUseCase } from './application/disconnect-connection.usecase';
import { ExchangeTokenUseCase } from './application/exchange-token.usecase';
import { InitiateConnectionUseCase } from './application/initiate-connection.usecase';
import { ListBankConnectionsUseCase } from './application/list-bank-connections.usecase';
import { MarkRequiresReauthorizationUseCase } from './application/mark-requires-reauthorization.usecase';
import { SyncTransactionsUseCase } from './application/sync-transactions.usecase';
import { ACCESS_TOKEN_ENCRYPTION_KEY } from './application/token-encryption-key';
import { BankConnectionOrmEntity } from './infrastructure/bank-connection.orm-entity';
import { CasIdConnectionSessionOrmEntity } from './infrastructure/cas-id-connection-session.orm-entity';
import { ConnectionAuditEventOrmEntity } from './infrastructure/connection-audit-event.orm-entity';
import { MockCasIdAdapter } from './infrastructure/mock-cas-id.adapter';
import { TypeOrmBankConnectionRepository } from './infrastructure/typeorm-bank-connection.repository';
import { TypeOrmCasIdConnectionSessionRepository } from './infrastructure/typeorm-cas-id-connection-session.repository';
import { TypeOrmConnectionAuditEventRepository } from './infrastructure/typeorm-connection-audit-event.repository';
import { BankConnectionsController } from './presentation/bank-connections.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CasIdConnectionSessionOrmEntity,
      BankConnectionOrmEntity,
      ConnectionAuditEventOrmEntity,
    ]),
  ],
  controllers: [BankConnectionsController],
  providers: [
    {
      provide: CAS_ID_CONNECTION_SESSION_REPOSITORY,
      useClass: TypeOrmCasIdConnectionSessionRepository,
    },
    {
      provide: BANK_CONNECTION_REPOSITORY,
      useClass: TypeOrmBankConnectionRepository,
    },
    {
      provide: CONNECTION_AUDIT_EVENT_REPOSITORY,
      useClass: TypeOrmConnectionAuditEventRepository,
    },
    { provide: CAS_ID_INTEGRATION_ADAPTER, useClass: MockCasIdAdapter },
    {
      provide: ACCESS_TOKEN_ENCRYPTION_KEY,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.getOrThrow<string>('ACCESS_TOKEN_ENCRYPTION_KEY'),
    },
    InitiateConnectionUseCase,
    ExchangeTokenUseCase,
    DisconnectConnectionUseCase,
    ListBankConnectionsUseCase,
    MarkRequiresReauthorizationUseCase,
    SyncTransactionsUseCase,
  ],
  exports: [
    BANK_CONNECTION_REPOSITORY,
    CAS_ID_INTEGRATION_ADAPTER,
    ACCESS_TOKEN_ENCRYPTION_KEY,
    InitiateConnectionUseCase,
    ExchangeTokenUseCase,
    DisconnectConnectionUseCase,
    ListBankConnectionsUseCase,
    MarkRequiresReauthorizationUseCase,
    SyncTransactionsUseCase,
  ],
})
export class BankConnectionsModule {}
