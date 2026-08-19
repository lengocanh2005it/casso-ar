import { ApiProperty } from '@nestjs/swagger';
import { LedgerEventKind } from '../../domain/ledger-event-kind';
import { LedgerEventSubjectType } from '../../domain/ledger-event-subject-type';

export class LedgerEventResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: String })
  organizationId: string;

  @ApiProperty({ enum: LedgerEventSubjectType })
  subjectType: LedgerEventSubjectType;

  @ApiProperty({ type: String, format: 'uuid' })
  subjectId: string;

  @ApiProperty({ enum: LedgerEventKind })
  kind: LedgerEventKind;

  @ApiProperty({ type: Number })
  amount: number;

  @ApiProperty({ type: String, example: '2026-08-14T10:00:00.000Z' })
  effectiveAt: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  transitionReferenceId: string | null;

  @ApiProperty({ type: String, example: '2026-08-14T10:00:00.000Z' })
  createdAt: string;
}

export class LedgerEventListResponseDto {
  @ApiProperty({ type: [LedgerEventResponseDto] })
  items: LedgerEventResponseDto[];

  @ApiProperty()
  total: number;
}
