import type { EntityManager } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { Invoice } from '../domain/invoice';

// Stable row-error code returned to the FE when an invoice number collides
// with an existing invoice for the same organization.
export const DUPLICATE_INVOICE_NUMBER = 'DUPLICATE_INVOICE_NUMBER';

export interface IInvoiceRepository {
  findById(id: string): Promise<Invoice | null>;
  findByInvoiceNumber(
    invoiceNumber: string,
    manager?: EntityManager,
  ): Promise<Invoice | null>;
  findByIds(ids: string[]): Promise<Map<string, Invoice>>;
  findIdsByInvoiceNumberSearch(
    organizationId: string,
    search: string,
    limit: number,
  ): Promise<string[]>;
  save(invoice: Invoice, manager?: EntityManager): Promise<void>;
}

export const INVOICE_REPOSITORY = Symbol('INVOICE_REPOSITORY');

// The repository signals a duplicate invoice number as an AppError carrying
// the stable row-error code, so application code never inspects database
// error shapes.
export function isDuplicateInvoiceNumberError(error: unknown): boolean {
  return (
    error instanceof AppError &&
    error.errorCode === ErrorCode.CONFLICT &&
    typeof error.details === 'object' &&
    error.details !== null &&
    'rowErrorCode' in error.details &&
    error.details.rowErrorCode === DUPLICATE_INVOICE_NUMBER
  );
}
