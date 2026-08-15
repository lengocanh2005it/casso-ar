import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExportReceivableBalanceHistoryUseCase } from './application/export-receivable-balance-history.usecase';
import { GetReceivableBalanceHistorySummaryUseCase } from './application/get-receivable-balance-history-summary.usecase';
import { ListReceivableBalanceHistoryUseCase } from './application/list-receivable-balance-history.usecase';
import { RECEIVABLE_BALANCE_HISTORY_REPOSITORY } from './application/receivable-balance-history.repository.port';
import { RECEIVABLE_BALANCE_HISTORY_QUERY } from './application/receivable-balance-history-query.port';
import { ReceivableBalanceHistoryRecorderService } from './application/receivable-balance-history-recorder.service';
import { ReceivableBalanceHistoryOrmEntity } from './infrastructure/receivable-balance-history.orm-entity';
import { ReceivableBalanceHistoryCoverageOrmEntity } from './infrastructure/receivable-balance-history-coverage.orm-entity';
import { TypeOrmReceivableBalanceHistoryRepository } from './infrastructure/typeorm-receivable-balance-history.repository';
import { TypeOrmReceivableBalanceHistoryQuery } from './infrastructure/typeorm-receivable-balance-history-query';
import { ReceivableBalanceHistoryController } from './presentation/receivable-balance-history.controller';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReceivableBalanceHistoryOrmEntity,
      ReceivableBalanceHistoryCoverageOrmEntity,
    ]),
  ],
  controllers: [ReceivableBalanceHistoryController],
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
    ListReceivableBalanceHistoryUseCase,
    GetReceivableBalanceHistorySummaryUseCase,
    ExportReceivableBalanceHistoryUseCase,
  ],
  exports: [
    RECEIVABLE_BALANCE_HISTORY_REPOSITORY,
    RECEIVABLE_BALANCE_HISTORY_QUERY,
    ReceivableBalanceHistoryRecorderService,
  ],
})
export class ReceivableBalanceHistoryModule {}
