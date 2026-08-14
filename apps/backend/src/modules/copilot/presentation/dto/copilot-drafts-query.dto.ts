import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import type { CopilotDraftStatus } from '../../application/derive-draft-status';

const COPILOT_DRAFT_STATUSES: CopilotDraftStatus[] = [
  'DRAFTED',
  'PENDING',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
];

export class CopilotDraftsQueryDto extends PaginationDto {
  @ApiProperty({ enum: COPILOT_DRAFT_STATUSES, required: false })
  @IsOptional()
  @IsIn(COPILOT_DRAFT_STATUSES)
  status?: CopilotDraftStatus;
}
