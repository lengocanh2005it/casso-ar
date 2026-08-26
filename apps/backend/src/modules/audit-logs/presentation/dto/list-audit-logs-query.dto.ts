import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../../common/audit/audit.enums';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

export class ListAuditLogsQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(AuditEntityType)
  entityType?: AuditEntityType;

  @IsOptional()
  @IsEnum(AuditActionType)
  actionType?: AuditActionType;

  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @IsOptional()
  @IsUUID()
  receivableId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
