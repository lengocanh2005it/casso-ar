import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class BalanceHookDataDto {
  @IsInt() id: number;
  @IsOptional() reference?: string | null;
  @IsOptional() description?: string;
  @IsInt() amount: number;
  @IsOptional() runningBalance?: number;
  @IsString() @IsNotEmpty() transactionDateTime: string;
  @IsString() @IsNotEmpty() accountNumber: string;
  @IsOptional() bankName?: string;
  @IsOptional() bankAbbreviation?: string;
  @IsOptional() virtualAccountNumber?: string;
  @IsOptional() virtualAccountName?: string;
  @IsOptional() counterAccountName?: string;
  @IsOptional() counterAccountNumber?: string | number;
  @IsOptional() counterAccountBankId?: string;
  @IsOptional() counterAccountBankName?: string;
}

export class BalanceHookDto {
  @IsInt() error: number;

  @ValidateNested()
  @Type(() => BalanceHookDataDto)
  data: BalanceHookDataDto;
}
