import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { BatchSkipBankTransactionUseCase } from './application/batch-skip-bank-transaction.usecase';
import { MarkPrepaidBankTransactionUseCase } from './application/mark-prepaid-bank-transaction.usecase';
import { MatchBankTransactionUseCase } from './application/match-bank-transaction.usecase';
import { SkipBankTransactionUseCase } from './application/skip-bank-transaction.usecase';
import { UnmatchedBankTransactionsQueryService } from './application/unmatched-bank-transactions-query.service';
import { ExceptionQueueController } from './presentation/exception-queue.controller';

@Module({
  imports: [WebhooksModule, ReceivablesModule, PaymentsModule, CustomersModule],
  providers: [
    MatchBankTransactionUseCase,
    SkipBankTransactionUseCase,
    BatchSkipBankTransactionUseCase,
    MarkPrepaidBankTransactionUseCase,
    UnmatchedBankTransactionsQueryService,
  ],
  controllers: [ExceptionQueueController],
})
export class ExceptionQueueModule {}
