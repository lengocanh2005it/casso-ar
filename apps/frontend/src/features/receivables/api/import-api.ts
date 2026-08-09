import { apiRequest } from '@/lib/api-client';

export interface ImportRowFailure {
  rowNumber: number;
  data: Record<string, unknown>;
  errors: string[];
}

export interface ImportResult {
  totalRows: number;
  successCount: number;
  failedRows: ImportRowFailure[];
}

export function importInvoices(file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  return apiRequest<ImportResult>({
    url: '/api/v1/invoices/import',
    method: 'POST',
    data: form,
    headers: {
      'Content-Type': 'multipart/form-data',
      'Idempotency-Key': crypto.randomUUID(),
    },
  });
}
