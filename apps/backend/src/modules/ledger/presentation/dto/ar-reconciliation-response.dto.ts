import { ApiProperty } from '@nestjs/swagger';
import {
  type ArReconciliationFinding,
  ArReconciliationFindingCode,
} from '../../domain/ar-reconciliation';
import { LedgerEventSubjectType } from '../../domain/ledger-event-subject-type';

export class ArReconciliationFindingResponseDto
  implements ArReconciliationFinding
{
  @ApiProperty({ type: String, format: 'uuid' })
  organizationId: string;

  @ApiProperty({ enum: LedgerEventSubjectType })
  subjectType: LedgerEventSubjectType;

  @ApiProperty({ type: String, format: 'uuid' })
  subjectId: string;

  @ApiProperty({ enum: ArReconciliationFindingCode })
  code: ArReconciliationFindingCode;

  @ApiProperty({ type: Number, nullable: true, description: 'Integer VND' })
  storedValue: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Integer VND' })
  expectedValue: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Integer VND' })
  delta: number | null;
}

export class ArReconciliationResponseDto {
  @ApiProperty({ type: [ArReconciliationFindingResponseDto] })
  findings: ArReconciliationFindingResponseDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'PAYMENT:20000000-0000-4000-8000-000000000001',
  })
  nextCursor: string | null;

  @ApiProperty({ type: Boolean })
  complete: boolean;
}
