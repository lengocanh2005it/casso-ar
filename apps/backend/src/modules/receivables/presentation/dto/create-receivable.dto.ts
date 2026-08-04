import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateReceivableDto {
  @IsUUID()
  customerId: string;

  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @IsInt()
  @IsPositive()
  originalAmount: number;

  @IsString()
  dueDate: string;

  @IsUUID()
  @IsOptional()
  salesRepresentativeId: string | null;
}
