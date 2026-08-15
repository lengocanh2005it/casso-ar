import { ReceivableStatus } from '@casso-ledger/shared-types';
import { ApiProperty } from '@nestjs/swagger';
import type {
  ReceivableBalanceHistoryDailyPoint,
  ReceivableBalanceHistoryListItem,
  ReceivableBalanceHistoryListPage,
  ReceivableBalanceHistorySourcePoint,
  ReceivableBalanceHistorySummary,
} from '../../application/receivable-balance-history-query.port';
import { BalanceHistoryActorType } from '../../domain/balance-history-actor-type';
import { BalanceHistoryChangeSource } from '../../domain/balance-history-change-source';
import { BalanceHistoryReasonCode } from '../../domain/balance-history-reason-code';

export class ReceivableBalanceHistoryListItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty()
  sequence: number;

  @ApiProperty({ type: String, format: 'uuid' })
  receivableId: string;

  @ApiProperty({ type: String, nullable: true })
  invoiceNumber: string | null;

  @ApiProperty({ type: String, format: 'uuid' })
  customerId: string;

  @ApiProperty({ type: String, nullable: true })
  customerName: string | null;

  @ApiProperty({ enum: ReceivableStatus })
  status: ReceivableStatus;

  @ApiProperty()
  remainingAmount: number;

  @ApiProperty({ type: String, example: '2026-08-14T10:00:00.000Z' })
  effectiveAt: string;

  @ApiProperty({ enum: BalanceHistoryChangeSource })
  changeSource: BalanceHistoryChangeSource;

  @ApiProperty({ type: String, nullable: true })
  reasonCode: BalanceHistoryReasonCode | null;

  @ApiProperty({ type: String, nullable: true })
  actorType: BalanceHistoryActorType | null;

  @ApiProperty({ type: String, nullable: true })
  actorDisplayName: string | null;

  @ApiProperty({ type: String, nullable: true })
  transitionReferenceId: string | null;

  @ApiProperty({ type: String, nullable: true })
  note: string | null;
}

export function toReceivableBalanceHistoryListItemDto(
  item: ReceivableBalanceHistoryListItem,
): ReceivableBalanceHistoryListItemDto {
  return {
    id: item.id,
    sequence: item.sequence,
    receivableId: item.receivableId,
    invoiceNumber: item.invoiceNumber,
    customerId: item.customerId,
    customerName: item.customerName,
    status: item.status,
    remainingAmount: item.remainingAmount,
    effectiveAt: item.effectiveAt.toISOString(),
    changeSource: item.changeSource,
    reasonCode: item.reasonCode,
    actorType: item.actorType,
    actorDisplayName: item.actorDisplayName,
    transitionReferenceId: item.transitionReferenceId,
    note: item.note,
  };
}

export class ReceivableBalanceHistoryListResponseDto {
  @ApiProperty({ type: [ReceivableBalanceHistoryListItemDto] })
  items: ReceivableBalanceHistoryListItemDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}

export function toReceivableBalanceHistoryListResponse(
  page: ReceivableBalanceHistoryListPage,
  requestedPage: number,
  requestedLimit: number,
): ReceivableBalanceHistoryListResponseDto {
  return {
    items: page.items.map(toReceivableBalanceHistoryListItemDto),
    total: page.total,
    page: requestedPage,
    limit: requestedLimit,
  };
}

export class ReceivableBalanceHistoryDailyPointDto {
  @ApiProperty({ example: '2026-08-14' })
  date: string;

  @ApiProperty()
  transitions: number;
}

export class ReceivableBalanceHistorySourcePointDto {
  @ApiProperty({ enum: BalanceHistoryChangeSource })
  changeSource: BalanceHistoryChangeSource;

  @ApiProperty()
  count: number;
}

export class ReceivableBalanceHistorySummaryDto {
  @ApiProperty()
  totalTransitions: number;

  @ApiProperty()
  affectedReceivables: number;

  @ApiProperty()
  latestRemainingAmount: number;

  @ApiProperty({ type: [ReceivableBalanceHistoryDailyPointDto] })
  dailySeries: ReceivableBalanceHistoryDailyPoint[];

  @ApiProperty({ type: [ReceivableBalanceHistorySourcePointDto] })
  sourceDistribution: ReceivableBalanceHistorySourcePoint[];
}

export function toReceivableBalanceHistorySummaryDto(
  summary: ReceivableBalanceHistorySummary,
): ReceivableBalanceHistorySummaryDto {
  return {
    totalTransitions: summary.totalTransitions,
    affectedReceivables: summary.affectedReceivables,
    latestRemainingAmount: summary.latestRemainingAmount,
    dailySeries: summary.dailySeries,
    sourceDistribution: summary.sourceDistribution,
  };
}
