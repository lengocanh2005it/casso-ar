import { ReceivableSummaryResponseDto } from './receivable-summary-response.dto';

export class ListReceivablesResponseDto {
  items: ReceivableSummaryResponseDto[];
  total: number;
  page: number;
  limit: number;
}
