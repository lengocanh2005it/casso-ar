import { Module } from '@nestjs/common';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { CustomersModule } from '../customers/customers.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { BatchMarkPrepaidBankTransactionUseCase } from './application/batch-mark-prepaid-bank-transaction.usecase';
import { BatchMatchBankTransactionUseCase } from './application/batch-match-bank-transaction.usecase';
import { BatchSkipBankTransactionUseCase } from './application/batch-skip-bank-transaction.usecase';
import { MarkPrepaidBankTransactionUseCase } from './application/mark-prepaid-bank-transaction.usecase';
import { MatchBankTransactionUseCase } from './application/match-bank-transaction.usecase';
import { SkipBankTransactionUseCase } from './application/skip-bank-transaction.usecase';
import { UnmatchedBankTransactionsQueryService } from './application/unmatched-bank-transactions-query.service';
import { ExceptionQueueController } from './presentation/exception-queue.controller';

@Module({
  imports: [
    WebhooksModule,
    ReceivablesModule,
    PaymentsModule,
    CustomersModule,
    InvoicesModule,
    BankAccountsModule,
  ],
  providers: [
    MatchBankTransactionUseCase,
    BatchMatchBankTransactionUseCase,
    SkipBankTransactionUseCase,
    BatchSkipBankTransactionUseCase,
    MarkPrepaidBankTransactionUseCase,
    BatchMarkPrepaidBankTransactionUseCase,
    UnmatchedBankTransactionsQueryService,
  ],
  controllers: [ExceptionQueueController],
})
export class ExceptionQueueModule {}
