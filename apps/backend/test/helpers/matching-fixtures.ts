import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReceivableStatus } from '@casso-ar/shared-types';
import type { DataSource } from 'typeorm';
import { CustomerBankAccountOrmEntity } from '../../src/modules/bank-accounts/infrastructure/customer-bank-account.orm-entity';
import { CustomerOrmEntity } from '../../src/modules/customers/infrastructure/customer.orm-entity';
import { InvoiceStatus } from '../../src/modules/invoices/domain/invoice';
import { InvoiceOrmEntity } from '../../src/modules/invoices/infrastructure/invoice.orm-entity';
import { ReceivableOrmEntity } from '../../src/modules/receivables/infrastructure/receivable.orm-entity';

/**
 * Every case in the corpus is dated the same moment, so every score is a fixed
 * number and the ranking never depends on the day the suite runs.
 */
export const REPLAY_TRANSFER_DATE_TIME = '2026-03-10 10:00:00';

export interface ReplayCustomer {
  key: string;
  name: string;
  /** Defaults to the case's organization; set it to build a cross-tenant decoy. */
  organizationId?: string;
}

export interface ReplayInvoice {
  key: string;
  customerKey: string;
  invoiceNumber: string;
  totalAmount: number;
}

export interface ReplayReceivable {
  key: string;
  customerKey: string;
  invoiceKey: string;
  originalAmount: number;
  paidAmount?: number;
  dueDate: string;
  status?: ReceivableStatus;
}

export interface ReplayGiven {
  customers?: ReplayCustomer[];
  payerAccounts?: { customerKey: string; accountNumber: string }[];
  invoices?: ReplayInvoice[];
  receivables?: ReplayReceivable[];
}

export interface ReplayWebhook {
  providerTransactionId: string;
  amount: number;
  counterAccountNumber: string;
  counterAccountName: string;
  description: string;
}

export interface ReplayExpectation {
  finalStatus: string;
  /** This case's own receivables, ordered by totalScore descending. */
  candidates: { key: string; totalScore: number }[];
  persistedCandidateKeys: string[];
  $comment?: string[];
}

export interface ReplayCase {
  name: string;
  $comment?: string[];
  given: ReplayGiven;
  webhook: ReplayWebhook;
  expect: ReplayExpectation;
}

export interface SeededIds {
  customers: Map<string, string>;
  invoices: Map<string, string>;
  receivables: Map<string, string>;
}

export function loadReplayCases(): ReplayCase[] {
  const raw = readFileSync(
    join(__dirname, '..', 'fixtures', 'matching-replay-cases.json'),
    'utf8',
  );
  return (JSON.parse(raw) as { cases: ReplayCase[] }).cases;
}

/**
 * Writes one case's given state. Ids are random, so nothing in the corpus can
 * depend on them — the expectation only ever names fixture keys.
 */
export async function seedReplayCase(
  dataSource: DataSource,
  replayCase: ReplayCase,
  defaultOrganizationId: string,
): Promise<SeededIds> {
  const given = replayCase.given;
  const customers = new Map<string, string>();
  const invoices = new Map<string, string>();
  const receivables = new Map<string, string>();
  const unique = replayCase.webhook.providerTransactionId;

  for (const customer of given.customers ?? []) {
    const id = randomUUID();
    customers.set(customer.key, id);
    await dataSource.getRepository(CustomerOrmEntity).save({
      id,
      organizationId: customer.organizationId ?? defaultOrganizationId,
      name: customer.name,
      taxCode: `REPLAY-${unique}-${customer.key}`,
      email: `replay-${unique}-${customer.key}@example.com`,
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      createdAt: new Date(),
    });
  }

  for (const payerAccount of given.payerAccounts ?? []) {
    const customerId = customers.get(payerAccount.customerKey);
    if (!customerId)
      throw new Error(`Unknown customerKey ${payerAccount.customerKey}`);
    await dataSource.getRepository(CustomerBankAccountOrmEntity).save({
      id: randomUUID(),
      organizationId: defaultOrganizationId,
      customerId,
      accountNumber: payerAccount.accountNumber,
      isActive: true,
      confirmedByUserId: null,
      confirmedAt: null,
    });
  }

  for (const invoice of given.invoices ?? []) {
    const customer = given.customers?.find(
      (c) => c.key === invoice.customerKey,
    );
    const customerId = customers.get(invoice.customerKey);
    if (!customerId)
      throw new Error(`Unknown customerKey ${invoice.customerKey}`);
    const id = randomUUID();
    invoices.set(invoice.key, id);
    await dataSource.getRepository(InvoiceOrmEntity).save({
      id,
      organizationId: customer?.organizationId ?? defaultOrganizationId,
      customerId,
      invoiceNumber: invoice.invoiceNumber,
      issueDate: new Date('2026-01-05'),
      totalAmount: invoice.totalAmount,
      taxAmount: 0,
      sourceType: 'MANUAL',
      fileUrl: null,
      status: InvoiceStatus.ISSUED,
      createdAt: new Date(),
    });
  }

  for (const receivable of given.receivables ?? []) {
    const customer = given.customers?.find(
      (c) => c.key === receivable.customerKey,
    );
    const customerId = customers.get(receivable.customerKey);
    const invoiceId = invoices.get(receivable.invoiceKey);
    if (!customerId)
      throw new Error(`Unknown customerKey ${receivable.customerKey}`);
    if (!invoiceId)
      throw new Error(`Unknown invoiceKey ${receivable.invoiceKey}`);
    const id = randomUUID();
    receivables.set(receivable.key, id);
    await dataSource.getRepository(ReceivableOrmEntity).save({
      id,
      organizationId: customer?.organizationId ?? defaultOrganizationId,
      customerId,
      invoiceId,
      originalAmount: receivable.originalAmount,
      paidAmount: receivable.paidAmount ?? 0,
      dueDate: new Date(receivable.dueDate),
      status: receivable.status ?? ReceivableStatus.OPEN,
      salesRepresentativeId: null,
      createdAt: new Date(),
      closedAt: null,
      version: 1,
    });
  }

  return { customers, invoices, receivables };
}

/** The Casso Flow payload exactly as `ReceiveWebhookUseCase` would persist it. */
export function toCassoRawPayload(
  replayCase: ReplayCase,
): Record<string, unknown> {
  return {
    error: 0,
    data: {
      id: replayCase.webhook.providerTransactionId,
      transactionDateTime: REPLAY_TRANSFER_DATE_TIME,
      accountNumber: '0088776655',
      amount: replayCase.webhook.amount,
      description: replayCase.webhook.description,
      counterAccountNumber: replayCase.webhook.counterAccountNumber,
      counterAccountName: replayCase.webhook.counterAccountName,
    },
  };
}
