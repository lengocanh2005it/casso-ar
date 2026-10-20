import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ReceivableCombinationSuggestionsQueryDto {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsUUID()
  customerId?: string;
}
