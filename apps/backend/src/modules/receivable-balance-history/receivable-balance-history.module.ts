import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RECEIVABLE_BALANCE_HISTORY_REPOSITORY } from './application/receivable-balance-history.repository.port';
import { RECEIVABLE_BALANCE_HISTORY_QUERY } from './application/receivable-balance-history-query.port';
import { ReceivableBalanceHistoryRecorderService } from './application/receivable-balance-history-recorder.service';
import { ReceivableBalanceHistoryOrmEntity } from './infrastructure/receivable-balance-history.orm-entity';
import { TypeOrmReceivableBalanceHistoryRepository } from './infrastructure/typeorm-receivable-balance-history.repository';
import { TypeOrmReceivableBalanceHistoryQuery } from './infrastructure/typeorm-receivable-balance-history-query';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ReceivableBalanceHistoryOrmEntity])],
  providers: [
    {
      provide: RECEIVABLE_BALANCE_HISTORY_REPOSITORY,
      useClass: TypeOrmReceivableBalanceHistoryRepository,
    },
    {
      provide: RECEIVABLE_BALANCE_HISTORY_QUERY,
      useClass: TypeOrmReceivableBalanceHistoryQuery,
    },
    ReceivableBalanceHistoryRecorderService,
  ],
  exports: [
    RECEIVABLE_BALANCE_HISTORY_REPOSITORY,
    RECEIVABLE_BALANCE_HISTORY_QUERY,
    ReceivableBalanceHistoryRecorderService,
  ],
})
export class ReceivableBalanceHistoryModule {}
