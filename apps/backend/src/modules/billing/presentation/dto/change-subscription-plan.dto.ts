import { PlanId } from '@casso-ledger/shared-types';
import { IsEnum } from 'class-validator';

export class ChangeSubscriptionPlanDto {
  @IsEnum(PlanId)
  planId: PlanId;
}
