import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export const BATCH_MAX_ITEMS = 50;

export class BatchIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BATCH_MAX_ITEMS)
  @IsUUID('4', { each: true })
  ids: string[];
}
