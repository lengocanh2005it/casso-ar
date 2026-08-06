import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class BalanceHookDto {
  @IsOptional() @IsString() organizationId?: string;
  @IsString() @IsNotEmpty() bankConnectionId: string;
  @IsString() @IsNotEmpty() transactionId: string;
  @IsInt() amount: number;
  @IsISO8601() transactionDateTime: string;
  @IsString() @IsNotEmpty() counterpartyAccountNumber: string;
  @IsString() @IsNotEmpty() counterpartyName: string;
  @IsString() @IsNotEmpty() transferContent: string;
}
