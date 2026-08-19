import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerEventRecorderService } from './application/ledger-event-recorder.service';
import { LEDGER_EVENT_REPOSITORY } from './application/ledger-event-repository.port';
import { LedgerEventOrmEntity } from './infrastructure/ledger-event.orm-entity';
import { TypeOrmLedgerEventRepository } from './infrastructure/typeorm-ledger-event.repository';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([LedgerEventOrmEntity])],
  providers: [
    {
      provide: LEDGER_EVENT_REPOSITORY,
      useClass: TypeOrmLedgerEventRepository,
    },
    LedgerEventRecorderService,
  ],
  exports: [LEDGER_EVENT_REPOSITORY, LedgerEventRecorderService],
})
export class LedgerModule {}
