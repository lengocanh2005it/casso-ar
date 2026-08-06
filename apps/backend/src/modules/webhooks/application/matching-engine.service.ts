import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ICustomerBankAccountRepository } from '../../bank-accounts/application/customer-bank-account-repository.port';
import { CUSTOMER_BANK_ACCOUNT_REPOSITORY } from '../../bank-accounts/application/customer-bank-account-repository.port';
import type { ICustomerRepository } from '../../customers/application/customer-repository.port';
import { CUSTOMER_REPOSITORY } from '../../customers/application/customer-repository.port';
import type { IInvoiceRepository } from '../../invoices/application/invoice-repository.port';
import { INVOICE_REPOSITORY } from '../../invoices/application/invoice-repository.port';
import type { IReceivableRepository } from '../../receivables/application/receivable-repository.port';
import { RECEIVABLE_REPOSITORY } from '../../receivables/application/receivable-repository.port';
import { MatchingCandidate } from '../domain/matching-candidate';
import { amountScore } from './scoring/amount-score';
import { customerBankAccountScore } from './scoring/customer-bank-account-score';
import { payerNameScore } from './scoring/payer-name-score';
import { referenceCodeScore } from './scoring/reference-code-score';
import { timingScore } from './scoring/timing-score';
import type { NormalizedTransaction } from './transaction-normalizer';

const ORG_WIDE_SCAN_LIMIT = 20;

export interface ScoredCandidate {
  receivableId: string;
  customerId: string;
  referenceCodeScore: number;
  amountScore: number;
  customerBankAccountScore: number;
  payerNameScore: number;
  timingScore: number;
  totalScore: number;
}

@Injectable()
export class MatchingEngineService {
  constructor(
    @Inject(CUSTOMER_BANK_ACCOUNT_REPOSITORY)
    private readonly bankAccountRepo: ICustomerBankAccountRepository,
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    @Inject(INVOICE_REPOSITORY)
    private readonly invoiceRepo: IInvoiceRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
  ) {}

  async scoreCandidates(
    transaction: NormalizedTransaction,
    organizationId: string,
  ): Promise<ScoredCandidate[]> {
    const account = await this.bankAccountRepo.findByAccountNumber(
      transaction.counterpartyAccountNumber,
    );
    const receivables = account
      ? await this.receivableRepo.findOpenByCustomerId(account.customerId)
      : await this.receivableRepo.findOpenTopNByOrganization(
          organizationId,
          ORG_WIDE_SCAN_LIMIT,
        );
    const customerName = account
      ? await this.customerRepo.findNameById(account.customerId)
      : null;
    const scored = await Promise.all(
      receivables.map(async (receivable) => {
        const invoice = await this.invoiceRepo.findByReceivableId(
          receivable.id,
        );
        const reference = invoice
          ? referenceCodeScore(
              transaction.transferContent,
              invoice.invoiceNumber,
            )
          : 0;
        const amount = amountScore(
          transaction.amount,
          receivable.remainingAmount,
        );
        const accountScore = account
          ? customerBankAccountScore(transaction.counterpartyAccountNumber, [
              account.accountNumber,
            ])
          : 0;
        const payer = customerName
          ? payerNameScore(transaction.counterpartyName, customerName)
          : 0;
        const timing = account
          ? timingScore(transaction.transactionDateTime, receivable.dueDate)
          : 0;
        return {
          receivableId: receivable.id,
          customerId: receivable.customerId,
          referenceCodeScore: reference,
          amountScore: amount,
          customerBankAccountScore: accountScore,
          payerNameScore: payer,
          timingScore: timing,
          totalScore: reference + amount + accountScore + payer + timing,
        };
      }),
    );
    return scored.sort((left, right) => right.totalScore - left.totalScore);
  }

  toMatchingCandidateEntities(
    organizationId: string,
    bankTransactionId: string,
    scored: ScoredCandidate[],
  ): MatchingCandidate[] {
    return scored.map(
      (candidate) =>
        new MatchingCandidate({
          id: randomUUID(),
          organizationId,
          bankTransactionId,
          ...candidate,
          createdAt: new Date(),
        }),
    );
  }
}
