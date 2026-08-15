export class ImportRowFailureResponseDto {
  rowNumber: number;
  data: Record<string, unknown>;
  errors: string[];
}

export class ImportInvoicesResponseDto {
  totalRows: number;
  successCount: number;
  failedRows: ImportRowFailureResponseDto[];
}
