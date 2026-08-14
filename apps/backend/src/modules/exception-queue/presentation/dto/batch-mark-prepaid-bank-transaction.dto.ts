import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { BATCH_MAX_ITEMS } from '../../../../common/dto/batch-ids.dto';

export class BatchMarkPrepaidBankTransactionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BATCH_MAX_ITEMS)
  @IsUUID('4', { each: true })
  bankTransactionIds: string[];

  @IsUUID()
  customerId: string;
}
