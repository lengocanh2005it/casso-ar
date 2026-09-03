import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCustomerBankAccountDto {
  @ApiProperty({
    type: String,
    description: 'Số tài khoản ngân hàng',
    example: '0123456789',
  })
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
  @ApiProperty({
    type: String,
    required: false,
    description: 'Số tài khoản ngân hàng mới',
    example: '0123456789',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  accountNumber?: string;

  @ApiProperty({
    type: Boolean,
    required: false,
    description: 'Trạng thái hoạt động',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

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
