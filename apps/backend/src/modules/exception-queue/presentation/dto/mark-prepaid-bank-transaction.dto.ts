import { IsUUID } from 'class-validator';

export class MarkPrepaidBankTransactionDto {
  @IsUUID()
  customerId: string;
}
