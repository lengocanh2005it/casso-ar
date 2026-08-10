import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  CreateReminderPolicyInput,
  ReminderExecutionFilters,
  UpdateReminderPolicyInput,
} from '../types';
import {
  createReminderPolicy,
  fetchReminderExecutions,
  fetchReminderPolicies,
  updateReminderPolicy,
} from './reminders-api';

export function useReminderPolicies() {
  return useQuery({
    queryKey: ['reminder-policies'],
    queryFn: fetchReminderPolicies,
  });
}

export function useCreateReminderPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReminderPolicyInput) =>
      createReminderPolicy(input),
    onSuccess: () => {
      toast.success('Đã tạo chính sách nhắc.');
      void queryClient.invalidateQueries({ queryKey: ['reminder-policies'] });
    },
    onError: () => toast.error('Không thể tạo chính sách nhắc.'),
  });
}

export function useUpdateReminderPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateReminderPolicyInput;
    }) => updateReminderPolicy(id, input),
    onSuccess: () => {
      toast.success('Đã cập nhật chính sách nhắc.');
      void queryClient.invalidateQueries({ queryKey: ['reminder-policies'] });
    },
    onError: () => toast.error('Không thể cập nhật chính sách nhắc.'),
  });
}

export function useReminderExecutions(filters: ReminderExecutionFilters = {}) {
  return useQuery({
    queryKey: ['reminder-executions', filters],
    queryFn: () => fetchReminderExecutions(filters),
  });
}
