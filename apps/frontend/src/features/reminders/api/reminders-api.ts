import { apiRequest, postWithIdempotency } from '@/lib/api-client';
import type {
  CreateReminderPolicyInput,
  ReminderExecutionFilters,
  ReminderExecutionPage,
  ReminderExecutionStatus,
  ReminderPolicy,
  UpdateReminderPolicyInput,
} from '../types';

export function fetchReminderPolicies(): Promise<ReminderPolicy[]> {
  return apiRequest<ReminderPolicy[]>({
    url: '/api/v1/reminder-policies',
    method: 'GET',
  });
}

export function createReminderPolicy(
  input: CreateReminderPolicyInput,
): Promise<ReminderPolicy> {
  return postWithIdempotency<ReminderPolicy>(
    '/api/v1/reminder-policies',
    input,
  );
}

export function updateReminderPolicy(
  id: string,
  input: UpdateReminderPolicyInput,
): Promise<ReminderPolicy> {
  return apiRequest<ReminderPolicy>({
    url: `/api/v1/reminder-policies/${id}`,
    method: 'PATCH',
    data: input,
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function fetchReminderExecutions(
  filters: ReminderExecutionFilters = {},
): Promise<ReminderExecutionPage> {
  return apiRequest<ReminderExecutionPage>({
    url: '/api/v1/reminder-executions',
    method: 'GET',
    params: {
      ...(filters.receivableId ? { receivableId: filters.receivableId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      page: filters.page ?? 1,
      limit: filters.limit ?? 20,
    },
  });
}

export function isReminderExecutionStatus(
  value: string,
): value is ReminderExecutionStatus {
  return ['PENDING', 'SENT', 'FAILED', 'SKIPPED'].includes(value);
}
