import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCustomerBankAccountDto {
  @IsString()
  @IsNotEmpty()
  accountNumber!: string;

  @ApiProperty({
    type: Boolean,
    required: false,
    description:
      'Xác nhận vẫn liên kết số tài khoản này dù nó đang thuộc khách hàng khác.',
  })
  @IsOptional()
  @IsBoolean()
  acknowledgeExistingLinks?: boolean;
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
