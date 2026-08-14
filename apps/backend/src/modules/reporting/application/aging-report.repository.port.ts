export type AgingBucket =
  | 'NOT_DUE'
  | 'OVERDUE_1_7'
  | 'OVERDUE_8_30'
  | 'OVERDUE_31_60'
  | 'OVERDUE_60_PLUS';

export const AGING_BUCKETS: AgingBucket[] = [
  'NOT_DUE',
  'OVERDUE_1_7',
  'OVERDUE_8_30',
  'OVERDUE_31_60',
  'OVERDUE_60_PLUS',
];

export interface AgingBucketCount {
  bucket: AgingBucket;
  count: number;
  totalRemaining: number;
}

export const AGING_REPORT_REPOSITORY = Symbol('AGING_REPORT_REPOSITORY');

export interface IAgingReportRepository {
  findBucketCounts(organizationId: string): Promise<AgingBucketCount[]>;
}
