import { apiRequest, postWithIdempotency } from '@/lib/api-client';
import type {
  InternalTask,
  Receivable,
  ReceivableStatus,
  ReceivableTimelineItem,
} from '../types';

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

export function createReceivable(
  input: CreateReceivableInput,
): Promise<Receivable> {
  return postWithIdempotency<Receivable>('/api/v1/receivables', input);
}

export function writeOffReceivable(id: string): Promise<Receivable> {
  return postWithIdempotency<Receivable>(`/api/v1/receivables/${id}/write-off`);
}

export function cancelReceivable(id: string): Promise<Receivable> {
  return postWithIdempotency<Receivable>(`/api/v1/receivables/${id}/cancel`);
}

export function fetchReceivableTimeline(
  id: string,
): Promise<ReceivableTimelineItem[]> {
  return apiRequest<ReceivableTimelineItem[]>({
    url: `/api/v1/receivables/${id}/timeline`,
    method: 'GET',
  });
}

export function addActivity(
  id: string,
  input: { activityType: string; description: string },
): Promise<ReceivableTimelineItem> {
  return postWithIdempotency<ReceivableTimelineItem>(
    `/api/v1/receivables/${id}/activities`,
    input,
  );
}

export function openDispute(
  id: string,
  input: { reason: string },
): Promise<{ id: string }> {
  return postWithIdempotency<{ id: string }>(
    `/api/v1/receivables/${id}/disputes`,
    input,
  );
}

export function resolveDispute(disputeId: string): Promise<{ id: string }> {
  return postWithIdempotency<{ id: string }>(
    `/api/v1/disputes/${disputeId}/resolve`,
  );
}

interface InternalTaskPage {
  items: InternalTask[];
  total: number;
  page: number;
  limit: number;
}

export async function fetchTasks(id: string): Promise<InternalTask[]> {
  const result = await apiRequest<InternalTaskPage>({
    url: `/api/v1/receivables/${id}/tasks`,
    method: 'GET',
    params: { page: 1, limit: 100 },
  });
  return result.items;
}

export function createTask(
  id: string,
  input: {
    title: string;
    description?: string;
    dueDate?: string;
    assignedToUserId?: string;
  },
): Promise<InternalTask> {
  return postWithIdempotency<InternalTask>(
    `/api/v1/receivables/${id}/tasks`,
    input,
  );
}

export function resolveTask(taskId: string): Promise<InternalTask> {
  return postWithIdempotency<InternalTask>(`/api/v1/tasks/${taskId}/resolve`);
}

export function dismissTask(taskId: string): Promise<InternalTask> {
  return postWithIdempotency<InternalTask>(`/api/v1/tasks/${taskId}/dismiss`);
}
