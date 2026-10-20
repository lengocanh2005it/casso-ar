import { ApiProperty } from '@nestjs/swagger';
import type {
  ReceivableCombinationGroupView,
  ReceivableCombinationSuggestionsView,
  ReceivableCombinationSuggestionView,
} from '../../application/unmatched-bank-transactions-query.service';

export class ReceivableCombinationSuggestionReceivableResponseDto {
  @ApiProperty({ type: String })
  receivableId: string;

  @ApiProperty({ type: String })
  customerId: string;

  @ApiProperty({ type: String, nullable: true })
  customerName: string | null;

  @ApiProperty({ type: String, nullable: true })
  invoiceNumber: string | null;

  @ApiProperty({ type: Number })
  remainingAmount: number;

  @ApiProperty({ type: Date, nullable: true })
  dueDate: Date | null;
}

export class ReceivableCombinationGroupResponseDto {
  @ApiProperty({ type: [ReceivableCombinationSuggestionReceivableResponseDto] })
  receivables: ReceivableCombinationSuggestionReceivableResponseDto[];
}

export class ReceivableCombinationSuggestionsResponseDto {
  @ApiProperty({ enum: ['CUSTOMER_REQUIRED', 'COMPLETE', 'INCOMPLETE'] })
  status: ReceivableCombinationSuggestionsView['status'];

  @ApiProperty({ type: [ReceivableCombinationGroupResponseDto] })
  combinations: ReceivableCombinationGroupResponseDto[];
}

function toReceivableResponse(
  receivable: ReceivableCombinationSuggestionView,
): ReceivableCombinationSuggestionReceivableResponseDto {
  return { ...receivable };
}

function toGroupResponse(
  group: ReceivableCombinationGroupView,
): ReceivableCombinationGroupResponseDto {
  return { receivables: group.receivables.map(toReceivableResponse) };
}

export function toReceivableCombinationSuggestionsResponse(
  view: ReceivableCombinationSuggestionsView,
): ReceivableCombinationSuggestionsResponseDto {
  return {
    status: view.status,
    combinations: view.combinations.map(toGroupResponse),
  };
}
