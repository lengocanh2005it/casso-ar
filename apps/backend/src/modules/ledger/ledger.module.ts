import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AR_RECONCILIATION_QUERY } from './application/ar-reconciliation-query.port';
import { LEDGER_EVENT_QUERY } from './application/ledger-event-query.port';
import { LedgerEventRecorderService } from './application/ledger-event-recorder.service';
import { LEDGER_EVENT_REPOSITORY } from './application/ledger-event-repository.port';
import { ListLedgerEventsUseCase } from './application/list-ledger-events.usecase';
import { ReconcileArBalancesUseCase } from './application/reconcile-ar-balances.usecase';
import { LedgerEventOrmEntity } from './infrastructure/ledger-event.orm-entity';
import { TypeOrmArReconciliationQuery } from './infrastructure/typeorm-ar-reconciliation-query';
import { TypeOrmLedgerEventRepository } from './infrastructure/typeorm-ledger-event.repository';
import { TypeOrmLedgerEventQuery } from './infrastructure/typeorm-ledger-event-query';
import { LedgerController } from './presentation/ledger.controller';
import { LedgerReconciliationController } from './presentation/ledger-reconciliation.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([LedgerEventOrmEntity])],
  controllers: [LedgerController, LedgerReconciliationController],
  providers: [
    {
      provide: AR_RECONCILIATION_QUERY,
      useClass: TypeOrmArReconciliationQuery,
    },
    {
      provide: LEDGER_EVENT_REPOSITORY,
      useClass: TypeOrmLedgerEventRepository,
    },
    {
      provide: LEDGER_EVENT_QUERY,
      useClass: TypeOrmLedgerEventQuery,
    },
    LedgerEventRecorderService,
    ListLedgerEventsUseCase,
    ReconcileArBalancesUseCase,
  ],
  exports: [
    LEDGER_EVENT_REPOSITORY,
    LEDGER_EVENT_QUERY,
    LedgerEventRecorderService,
  ],
})
export class LedgerModule {}
