import type { EntityManager } from 'typeorm';
import type { Invoice } from '../domain/invoice';

export interface IInvoiceRepository {
  findById(id: string): Promise<Invoice | null>;
  findByIds(ids: string[]): Promise<Map<string, Invoice>>;
  save(invoice: Invoice, manager?: EntityManager): Promise<void>;
}

export const INVOICE_REPOSITORY = Symbol('INVOICE_REPOSITORY');
