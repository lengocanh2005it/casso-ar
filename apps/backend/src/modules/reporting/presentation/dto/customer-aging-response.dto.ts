import { ApiProperty } from '@nestjs/swagger';
import type { AgingBucket } from '../../application/aging-report.repository.port';
import { AGING_BUCKETS } from '../../application/aging-report.repository.port';

export class CustomerAgingBucketResponseDto {
  @ApiProperty({ enum: AGING_BUCKETS })
  bucket: AgingBucket;

  @ApiProperty({ type: String, example: '9007199254740993' })
  totalRemaining: string;
}

export class CustomerAgingRowResponseDto {
  @ApiProperty()
  customerId: string;

  @ApiProperty()
  customerName: string;

  @ApiProperty()
  taxCode: string;

  @ApiProperty({ type: [CustomerAgingBucketResponseDto] })
  buckets: CustomerAgingBucketResponseDto[];

  @ApiProperty({ type: String, example: '9007199254740993' })
  totalRemaining: string;
}

export class CustomerAgingResponseDto {
  @ApiProperty({ type: [CustomerAgingRowResponseDto] })
  items: CustomerAgingRowResponseDto[];

  @ApiProperty({ type: Number })
  total: number;

  @ApiProperty({ type: Number })
  page: number;

  @ApiProperty({ type: Number })
  limit: number;
}
