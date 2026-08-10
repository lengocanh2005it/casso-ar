import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ICustomerBankAccountRepository } from '../../bank-accounts/application/customer-bank-account-repository.port';
import { CUSTOMER_BANK_ACCOUNT_REPOSITORY } from '../../bank-accounts/application/customer-bank-account-repository.port';
import type { ICustomerRepository } from '../../customers/application/customer-repository.port';
import { CUSTOMER_REPOSITORY } from '../../customers/application/customer-repository.port';
import type { IInvoiceRepository } from '../../invoices/application/invoice-repository.port';
import { INVOICE_REPOSITORY } from '../../invoices/application/invoice-repository.port';
import type { Invoice } from '../../invoices/domain/invoice';
import type { IReceivableRepository } from '../../receivables/application/receivable-repository.port';
import { RECEIVABLE_REPOSITORY } from '../../receivables/application/receivable-repository.port';
import type { Receivable } from '../../receivables/domain/receivable';
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
    private readonly bankAccountRepo: Pick<
      ICustomerBankAccountRepository,
      'findByAccountNumber' | 'save'
    >,
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
    let customerId = account?.customerId ?? null;
    let receivables = customerId
      ? await this.receivableRepo.findOpenByCustomerId(customerId)
      : await this.receivableRepo.findOpenTopNByOrganization(
          organizationId,
          ORG_WIDE_SCAN_LIMIT,
          transaction.transactionDateTime,
        );

    let invoiceByReceivableId = await this.findInvoicesByReceivableIds(
      receivables.map((receivable) => receivable.id),
    );

    if (!customerId) {
      customerId = this.resolveCustomerByReferenceCode(
        transaction.transferContent,
        receivables,
        invoiceByReceivableId,
      );
      if (customerId) {
        receivables =
          await this.receivableRepo.findOpenByCustomerId(customerId);
        invoiceByReceivableId = await this.findInvoicesByReceivableIds(
          receivables.map((receivable) => receivable.id),
        );
      }
    }

    const knownAccountNumber = account?.accountNumber ?? null;
    const customerName = customerId
      ? await this.customerRepo.findNameById(customerId)
      : null;
    const scored = receivables.map((receivable) => {
      const invoice = invoiceByReceivableId.get(receivable.id) ?? null;
      const reference = invoice
        ? referenceCodeScore(transaction.transferContent, invoice.invoiceNumber)
        : 0;
      const amount = amountScore(
        transaction.amount,
        receivable.remainingAmount,
      );
      const accountScore = customerId
        ? customerBankAccountScore(
            transaction.counterpartyAccountNumber,
            knownAccountNumber ? [knownAccountNumber] : [],
          )
        : 0;
      const payer =
        customerId && customerName
          ? payerNameScore(transaction.counterpartyName, customerName)
          : 0;
      const timing = customerId
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
    });
    return scored.sort((left, right) => right.totalScore - left.totalScore);
  }

  private async findInvoicesByReceivableIds(
    receivableIds: string[],
  ): Promise<Map<string, Invoice>> {
    const invoiceIdsByReceivableId =
      await this.receivableRepo.findInvoiceIdsByReceivableIds(receivableIds);
    const invoicesById = await this.invoiceRepo.findByIds([
      ...invoiceIdsByReceivableId.values(),
    ]);
    const invoicesByReceivableId = new Map<string, Invoice>();
    for (const [receivableId, invoiceId] of invoiceIdsByReceivableId) {
      const invoice = invoicesById.get(invoiceId);
      if (invoice) invoicesByReceivableId.set(receivableId, invoice);
    }
    return invoicesByReceivableId;
  }

  // Spec §3: customerId can also be resolved by finding an invoice/receivable
  // code in transferContent, not only via a stored CustomerBankAccount. Only
  // an exact reference-code match (score 60) is trusted to resolve identity —
  // a fuzzy near-match (30) is too weak to route a whole customer scope by.
  private resolveCustomerByReferenceCode(
    transferContent: string,
    orgWideReceivables: Receivable[],
    invoiceByReceivableId: Map<string, Invoice>,
  ): string | null {
    for (const receivable of orgWideReceivables) {
      const invoice = invoiceByReceivableId.get(receivable.id);
      if (
        invoice &&
        referenceCodeScore(transferContent, invoice.invoiceNumber) === 60
      ) {
        return receivable.customerId;
      }
    }
    return null;
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
