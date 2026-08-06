import type { EntityManager } from 'typeorm';
import type { Invoice } from '../domain/invoice';

export interface IInvoiceRepository {
  findById(id: string): Promise<Invoice | null>;
  // Batched invoice-by-receivable lookup — 2 queries total instead of 2 per
  // receivableId, for callers scoring many receivables against one webhook.
  findByReceivableIds(receivableIds: string[]): Promise<Map<string, Invoice>>;
  save(invoice: Invoice, manager?: EntityManager): Promise<void>;
}

export const INVOICE_REPOSITORY = Symbol('INVOICE_REPOSITORY');
