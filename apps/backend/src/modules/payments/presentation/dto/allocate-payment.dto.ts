import { IsInt, IsPositive, IsUUID } from 'class-validator';

export class AllocatePaymentDto {
  @IsUUID()
  receivableId: string;

  @IsInt()
  @IsPositive()
  amount: number;
}
