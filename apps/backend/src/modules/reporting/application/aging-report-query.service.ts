import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  AGING_REPORT_REPOSITORY,
  type AgingBucket,
  type AgingBucketCount,
  type IAgingReportRepository,
} from './aging-report.repository.port';

const BUCKET_ORDER: AgingBucket[] = [
  'NOT_DUE',
  'OVERDUE_1_7',
  'OVERDUE_8_30',
  'OVERDUE_31_60',
  'OVERDUE_60_PLUS',
];

@Injectable()
export class AgingReportQueryService {
  constructor(
    @Inject(AGING_REPORT_REPOSITORY)
    private readonly agingReportRepo: IAgingReportRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async getAgingBuckets(
    salesRepresentativeId?: string,
  ): Promise<AgingBucketCount[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows =
      salesRepresentativeId !== undefined
        ? await this.agingReportRepo.findBucketCounts(
            organizationId,
            salesRepresentativeId,
          )
        : await this.agingReportRepo.findBucketCounts(organizationId);
    const byBucket = new Map(rows.map((row) => [row.bucket, row]));

    return BUCKET_ORDER.map(
      (bucket) =>
        byBucket.get(bucket) ?? { bucket, count: 0, totalRemaining: 0 },
    );
  }
}
