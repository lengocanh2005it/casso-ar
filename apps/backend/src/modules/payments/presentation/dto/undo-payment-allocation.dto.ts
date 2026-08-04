import { IsNotEmpty, IsString } from 'class-validator';

export class UndoPaymentAllocationDto {
  @IsString()
  @IsNotEmpty()
  undoReason: string;
}
