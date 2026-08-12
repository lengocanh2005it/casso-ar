import { Injectable } from '@nestjs/common';
import { toCsv } from '../../../common/csv/csv-writer';
import { AgingReportQueryService } from './aging-report-query.service';

@Injectable()
export class ExportAgingReportUseCase {
  constructor(
    private readonly agingReportQueryService: AgingReportQueryService,
  ) {}

  async execute(): Promise<string> {
    const buckets = await this.agingReportQueryService.getAgingBuckets();
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
