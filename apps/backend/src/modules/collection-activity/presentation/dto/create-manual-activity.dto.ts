import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import {
  CollectionActivityType,
  MANUAL_ACTIVITY_TYPES,
} from '../../domain/collection-activity';

export class CreateManualActivityDto {
  @IsIn(MANUAL_ACTIVITY_TYPES)
  activityType:
    | CollectionActivityType.MANUAL_CALL
    | CollectionActivityType.MANUAL_NOTE
    | CollectionActivityType.PAYMENT_COMMITMENT;

  @IsString()
  @IsNotEmpty()
  description: string;
}
