import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LEDGER_EVENT_QUERY } from './application/ledger-event-query.port';
import { LedgerEventRecorderService } from './application/ledger-event-recorder.service';
import { LEDGER_EVENT_REPOSITORY } from './application/ledger-event-repository.port';
import { ListLedgerEventsUseCase } from './application/list-ledger-events.usecase';
import { LedgerEventOrmEntity } from './infrastructure/ledger-event.orm-entity';
import { TypeOrmLedgerEventRepository } from './infrastructure/typeorm-ledger-event.repository';
import { TypeOrmLedgerEventQuery } from './infrastructure/typeorm-ledger-event-query';
import { LedgerController } from './presentation/ledger.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([LedgerEventOrmEntity])],
  controllers: [LedgerController],
  providers: [
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
  ],
  exports: [
    LEDGER_EVENT_REPOSITORY,
    LEDGER_EVENT_QUERY,
    LedgerEventRecorderService,
  ],
})
export class LedgerModule {}
