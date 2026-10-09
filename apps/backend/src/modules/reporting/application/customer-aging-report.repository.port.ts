import type { AgingBucket } from './aging-report.repository.port';

export interface CustomerAgingFilters {
  page: number;
  limit: number;
  search?: string;
  bucket?: AgingBucket;
}

export interface CustomerAgingBucketAmount {
  bucket: AgingBucket;
  totalRemaining: string;
}

export interface CustomerAgingRow {
  customerId: string;
  customerName: string;
  taxCode: string;
  buckets: CustomerAgingBucketAmount[];
  totalRemaining: string;
}

export interface CustomerAgingPage {
  items: CustomerAgingRow[];
  total: number;
  page: number;
  limit: number;
}

export const CUSTOMER_AGING_REPORT_REPOSITORY = Symbol(
  'CUSTOMER_AGING_REPORT_REPOSITORY',
);

export interface ICustomerAgingReportRepository {
  findPage(
    organizationId: string,
    filters: CustomerAgingFilters,
    salesRepresentativeId?: string,
  ): Promise<CustomerAgingPage>;
}
