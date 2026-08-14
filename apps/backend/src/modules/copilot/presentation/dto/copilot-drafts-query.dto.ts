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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsIn(COPILOT_DRAFT_STATUSES)
  status?: CopilotDraftStatus;
}
