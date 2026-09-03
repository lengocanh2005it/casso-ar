import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { safeNormalizeAccountNumber } from '../../bank-accounts/application/account-number-normalizer';
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
import type { MatchingAiCandidate } from './matching-ai-recommendation.service';
import { amountScore } from './scoring/amount-score';
import { customerBankAccountScore } from './scoring/customer-bank-account-score';
import { payerNameScore } from './scoring/payer-name-score';
import { referenceCodeScore } from './scoring/reference-code-score';
import { timingScore } from './scoring/timing-score';
import type { NormalizedTransaction } from './transaction-normalizer';

const ORG_WIDE_SCAN_LIMIT = 20;

export interface ScoredCandidate extends MatchingAiCandidate {
  referenceCodeScore: number;
  amountScore: number;
  customerBankAccountScore: number;
  payerNameScore: number;
  timingScore: number;
}

@Injectable()
export class MatchingEngineService {
  constructor(
    @Inject(CUSTOMER_BANK_ACCOUNT_REPOSITORY)
    private readonly bankAccountRepo: Pick<
      ICustomerBankAccountRepository,
      'findActiveByAccountNumber' | 'save'
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
    const links = await this.bankAccountRepo.findActiveByAccountNumber(
      transaction.counterpartyAccountNumber,
    );
    const accountLinkedCustomerIds = new Set(
      links.map((link) => link.customerId),
    );
    const linkedCustomerIds = new Set(accountLinkedCustomerIds);
    const accountIsKnown = accountLinkedCustomerIds.size > 0;

    let receivables: Receivable[];
    if (accountIsKnown) {
      // ponytail: one query per linked customer, bounded by how many customers
      // authorized this one payer account (in practice 1-3); switch to a
      // batched findOpenByCustomerIds only if that fan-out ever grows.
      const perCustomer = await Promise.all(
        [...accountLinkedCustomerIds].map((id) =>
          this.receivableRepo.findOpenByCustomerId(id),
        ),
      );
      const byId = new Map<string, Receivable>();
      for (const receivable of perCustomer.flat()) {
        byId.set(receivable.id, receivable);
      }
      receivables = [...byId.values()];
    } else {
      receivables = await this.receivableRepo.findOpenTopNByOrganization(
        organizationId,
        ORG_WIDE_SCAN_LIMIT,
        transaction.transactionDateTime,
      );
    }

    let invoiceByReceivableId = await this.findInvoicesByReceivableIds(
      receivables.map((receivable) => receivable.id),
    );

    if (!accountIsKnown) {
      const resolvedId = this.resolveCustomerByReferenceCode(
        transaction.transferContent,
        receivables,
        invoiceByReceivableId,
      );
      if (resolvedId) {
        linkedCustomerIds.add(resolvedId);
        receivables =
          await this.receivableRepo.findOpenByCustomerId(resolvedId);
        invoiceByReceivableId = await this.findInvoicesByReceivableIds(
          receivables.map((r) => r.id),
        );
      }
    }

    const customerNames = new Map<string, string | null>();
    if (receivables.length > 0) {
      const customerIds = [
        ...new Set(receivables.map((receivable) => receivable.customerId)),
      ];
      const customers = await this.customerRepo.findByIds(customerIds);
      for (const id of customerIds) {
        customerNames.set(id, customers.get(id)?.name ?? null);
      }
    }

    // Normalized counterparty account for the deterministic account-match score
    // below — compared against each linked customer's saved account numbers.
    const normalizedCounterparty = safeNormalizeAccountNumber(
      transaction.counterpartyAccountNumber,
    );
    const savedAccountsByCustomer = new Map<string, string[]>();
    for (const link of links) {
      const list = savedAccountsByCustomer.get(link.customerId) ?? [];
      list.push(link.accountNumber);
      savedAccountsByCustomer.set(link.customerId, list);
    }

    const scored = receivables.map((receivable) => {
      const invoice = invoiceByReceivableId.get(receivable.id) ?? null;
      const reference = invoice
        ? referenceCodeScore(transaction.transferContent, invoice.invoiceNumber)
        : 0;
      const amount = amountScore(
        transaction.amount,
        receivable.remainingAmount,
      );
      const inLinkedSet = linkedCustomerIds.has(receivable.customerId);
      const accountScore = normalizedCounterparty
        ? customerBankAccountScore(
            normalizedCounterparty,
            savedAccountsByCustomer.get(receivable.customerId) ?? [],
          )
        : 0;
      const customerName = customerNames.get(receivable.customerId) ?? '';
      const payer =
        inLinkedSet && customerName
          ? payerNameScore(transaction.counterpartyName, customerName)
          : 0;
      const timing = inLinkedSet
        ? timingScore(transaction.transactionDateTime, receivable.dueDate)
        : 0;
      return {
        receivableId: receivable.id,
        customerId: receivable.customerId,
        invoiceNumber: invoice?.invoiceNumber ?? null,
        customerName: customerNames.get(receivable.customerId) ?? null,
        remainingAmount: receivable.remainingAmount,
        dueDate: receivable.dueDate,
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
          receivableId: candidate.receivableId,
          customerId: candidate.customerId,
          referenceCodeScore: candidate.referenceCodeScore,
          amountScore: candidate.amountScore,
          customerBankAccountScore: candidate.customerBankAccountScore,
          payerNameScore: candidate.payerNameScore,
          timingScore: candidate.timingScore,
          totalScore: candidate.totalScore,
          createdAt: new Date(),
        }),
    );
  }
}
