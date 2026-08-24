import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class TaxCodeLookupQueryDto {
  @ApiProperty({ type: String, example: '0101234567' })
  @IsString()
  @Matches(/^\d{10}(\d{3})?$/, {
    message: 'Mã số thuế phải gồm 10 hoặc 13 chữ số.',
  })
  taxCode!: string;
}
