import {
  PlanId,
  PlanPaymentHistoryProvenance,
  PlanPaymentHistorySourceType,
  PlanPaymentReceiptOutcome,
} from '@casso-ar/shared-types';
import { ApiProperty } from '@nestjs/swagger';
import type { PlanPaymentHistoryPage } from '../../application/plan-payment-history-repository.port';

export class PlanPaymentHistoryItemResponseDto {
  @ApiProperty({ enum: PlanPaymentHistorySourceType })
  paymentKind: PlanPaymentHistorySourceType;

  @ApiProperty({ type: String, example: '9007199254740993' })
  orderCode: string;

  @ApiProperty({ enum: PlanId })
  planId: PlanId;

  @ApiProperty({ type: Number, nullable: true })
  receivedAmount: number | null;

  @ApiProperty({ enum: PlanPaymentReceiptOutcome })
  initialOutcome: PlanPaymentReceiptOutcome;

  @ApiProperty({ enum: PlanPaymentHistoryProvenance })
  provenance: PlanPaymentHistoryProvenance;

  @ApiProperty({ type: String, format: 'date-time' })
  confirmedAt: string;
}

export class PlanPaymentHistoryResponseDto {
  @ApiProperty({ type: [PlanPaymentHistoryItemResponseDto] })
  items: PlanPaymentHistoryItemResponseDto[];

  @ApiProperty({ type: Number })
  total: number;

  @ApiProperty({ type: Number })
  page: number;

  @ApiProperty({ type: Number })
  limit: number;
}

export function toPlanPaymentHistoryResponse(
  page: PlanPaymentHistoryPage & { page: number; limit: number },
): PlanPaymentHistoryResponseDto {
  return {
    items: page.items.map((item) => ({
      paymentKind: item.sourceType,
      orderCode: item.orderCode,
      planId: item.planId,
      receivedAmount: item.receivedAmount,
      initialOutcome: item.initialOutcome,
      provenance: item.provenance,
      confirmedAt: item.confirmedAt.toISOString(),
    })),
    total: page.total,
    page: page.page,
    limit: page.limit,
  };
}
