import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { CopilotDraftStatus } from '../../application/derive-draft-status';

const COPILOT_DRAFT_STATUSES: CopilotDraftStatus[] = [
  'DRAFTED',
  'PENDING',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
];

export class CopilotDraftsQueryDto {
  @ApiProperty({ type: Number, minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiProperty({ type: Number, minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiProperty({ enum: COPILOT_DRAFT_STATUSES, required: false })
  @IsOptional()
  @IsIn(COPILOT_DRAFT_STATUSES)
  status?: CopilotDraftStatus;
}
