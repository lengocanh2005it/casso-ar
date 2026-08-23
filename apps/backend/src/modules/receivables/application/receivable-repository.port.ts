import type { EntityManager } from 'typeorm';
import type { Receivable } from '../domain/receivable';

export interface ReceivableListFilters {
  status?: string;
  salesRepresentativeId?: string;
  customerId?: string;
  // Resolved from a free-text search term (customer name/taxCode, invoice
  // number) before reaching the repository — see ListReceivablesUseCase.
  customerIdIn?: string[];
  invoiceIdIn?: string[];
}

export interface OverdueReceivableFilters {
  organizationId: string;
  referenceDate: Date;
  salesRepresentativeId?: string;
  customerIdIn?: string[];
  invoiceIdIn?: string[];
  limit: number;
}

export interface IReceivableRepository {
  findById(id: string): Promise<Receivable | null>;
  findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<Receivable | null>;
  save(receivable: Receivable, manager?: EntityManager): Promise<void>;
  findOpenByCustomerId(customerId: string): Promise<Receivable[]>;
  findOpenTopNByOrganization(
    organizationId: string,
    limit: number,
    referenceDate: Date,
  ): Promise<Receivable[]>;
  findOverdueByThreshold(
    organizationId: string,
    minDaysOverdue: number,
    afterId: string | null,
    limit: number,
  ): Promise<Receivable[]>;
  findOverdueCandidates(
    filters: OverdueReceivableFilters,
  ): Promise<Receivable[]>;
  findInvoiceIdsByReceivableIds(ids: string[]): Promise<Map<string, string>>;
  findPage(
    organizationId: string,
    filters: ReceivableListFilters,
    page: number,
    limit: number,
  ): Promise<Receivable[]>;
  count(
    organizationId: string,
    filters: ReceivableListFilters,
  ): Promise<number>;
}

export const RECEIVABLE_REPOSITORY = Symbol('RECEIVABLE_REPOSITORY');
