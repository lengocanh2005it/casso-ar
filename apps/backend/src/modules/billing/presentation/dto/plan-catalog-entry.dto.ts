import { PlanId } from '@casso-ar/shared-types';
import { ApiProperty } from '@nestjs/swagger';
import type { PlanCatalogEntry } from '../../domain/subscription';

export class PlanCatalogEntryDto {
  @ApiProperty({ enum: PlanId })
  planId: PlanId;

  @ApiProperty()
  priceVnd: number;

  @ApiProperty()
  receivableMonthlyLimit: number;

  @ApiProperty()
  bankConnectionLimit: number;

  @ApiProperty()
  copilotChatMonthlyLimit: number;
}

export function toPlanCatalogEntryDto(
  entry: PlanCatalogEntry,
): PlanCatalogEntryDto {
  return {
    planId: entry.planId,
    priceVnd: entry.priceVnd,
    receivableMonthlyLimit: entry.receivableMonthlyLimit,
    bankConnectionLimit: entry.bankConnectionLimit,
    copilotChatMonthlyLimit: entry.copilotChatMonthlyLimit,
  };
}
