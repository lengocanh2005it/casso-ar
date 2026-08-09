import { apiRequest } from '@/lib/api-client';
import type { Receivable, ReceivableStatus } from '../types';

export interface ReceivablePage {
  items: Receivable[];
  total: number;
  page: number;
  limit: number;
}

export interface ReceivableFilters {
  status?: ReceivableStatus;
  salesRepresentativeId?: string;
}

export interface CreateReceivableInput {
  customerId: string;
  invoiceId?: string;
  originalAmount: number;
  dueDate: string;
  salesRepresentativeId?: string | null;
}

export function fetchReceivables(
  filters: ReceivableFilters,
  page: number,
): Promise<ReceivablePage> {
  return apiRequest<ReceivablePage>({
    url: '/api/v1/receivables',
    method: 'GET',
    params: { ...filters, page, limit: 20 },
  });
}

export function fetchReceivable(id: string): Promise<Receivable> {
  return apiRequest<Receivable>({
    url: `/api/v1/receivables/${id}`,
    method: 'GET',
  });
}

function postReceivable<T>(url: string, data?: unknown): Promise<T> {
  return apiRequest<T>({
    url,
    method: 'POST',
    data,
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function createReceivable(
  input: CreateReceivableInput,
): Promise<Receivable> {
  return postReceivable<Receivable>('/api/v1/receivables', input);
}

export function writeOffReceivable(id: string): Promise<Receivable> {
  return postReceivable<Receivable>(`/api/v1/receivables/${id}/write-off`);
}

export function cancelReceivable(id: string): Promise<Receivable> {
  return postReceivable<Receivable>(`/api/v1/receivables/${id}/cancel`);
}
