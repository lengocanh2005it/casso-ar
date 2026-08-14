import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsPositive,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { BATCH_MAX_ITEMS } from '../../../../common/dto/batch-ids.dto';
import { MatchAllocationItemDto } from './match-bank-transaction.dto';

export class BatchMatchItemDto {
  @IsUUID()
  bankTransactionId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MatchAllocationItemDto)
  allocations: MatchAllocationItemDto[];

  @IsInt()
  @IsPositive()
  version: number;
}

export class BatchMatchBankTransactionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BATCH_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => BatchMatchItemDto)
  items: BatchMatchItemDto[];
}
