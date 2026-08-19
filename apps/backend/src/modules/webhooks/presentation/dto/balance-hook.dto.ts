import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class BalanceHookTransactionDto {
  @IsString() @IsNotEmpty() id: string;
  @IsInt() amount: number;
  @IsISO8601() transactionDateTime: string;
  @IsOptional() description?: string | null;
  @IsOptional() counterAccountNumber?: string | number | null;
  @IsOptional() counterAccountName?: string | null;
}

export class BalanceHookDto {
  @IsString() @IsNotEmpty() grantId: string;

  @ValidateNested()
  @Type(() => BalanceHookTransactionDto)
  transaction: BalanceHookTransactionDto;
}
