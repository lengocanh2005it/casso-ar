import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCustomerBankAccountDto {
  @IsString()
  @IsNotEmpty()
  accountNumber!: string;
}

export class UpdateCustomerBankAccountDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  accountNumber?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
