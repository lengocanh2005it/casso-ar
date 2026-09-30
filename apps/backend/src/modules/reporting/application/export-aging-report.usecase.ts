import { Injectable } from '@nestjs/common';
import { toCsv } from '../../../common/csv/csv-writer';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import { AgingReportQueryService } from './aging-report-query.service';

@Injectable()
export class ExportAgingReportUseCase {
  constructor(
    private readonly agingReportQueryService: AgingReportQueryService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(): Promise<string> {
    const user = this.tenantContext.getCurrentUser();
    const buckets =
      user?.role === Role.SALES_REP
        ? await this.agingReportQueryService.getAgingBuckets(user.userId)
        : await this.agingReportQueryService.getAgingBuckets();
    return toCsv(
      ['Nhóm tuổi nợ', 'Số khoản', 'Tổng còn lại (VND)'],
      buckets.map((bucket) => [
        bucket.bucket,
        String(bucket.count),
        String(bucket.totalRemaining),
      ]),
    );
  }
}
