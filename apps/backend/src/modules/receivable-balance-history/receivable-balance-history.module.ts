import { Global, Module } from '@nestjs/common';
import { RECEIVABLE_BALANCE_HISTORY_REPOSITORY } from './application/receivable-balance-history.repository.port';
import { ReceivableBalanceHistoryRecorderService } from './application/receivable-balance-history-recorder.service';
import { TypeOrmReceivableBalanceHistoryRepository } from './infrastructure/typeorm-receivable-balance-history.repository';

@Global()
@Module({
  providers: [
    {
      provide: RECEIVABLE_BALANCE_HISTORY_REPOSITORY,
      useClass: TypeOrmReceivableBalanceHistoryRepository,
    },
    ReceivableBalanceHistoryRecorderService,
  ],
  exports: [
    RECEIVABLE_BALANCE_HISTORY_REPOSITORY,
    ReceivableBalanceHistoryRecorderService,
  ],
})
export class ReceivableBalanceHistoryModule {}
