import { ApiProperty } from '@nestjs/swagger';

export class TaxCodeLookupResponseDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Công ty TNHH CASSO',
  })
  name!: string | null;
}
