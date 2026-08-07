import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsPositive,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class MatchAllocationItemDto {
  @IsUUID()
  receivableId: string;

  @IsInt()
  @IsPositive()
  amount: number;
}

export class MatchBankTransactionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MatchAllocationItemDto)
  allocations: MatchAllocationItemDto[];

  @IsInt()
  @IsPositive()
  version: number;
}
