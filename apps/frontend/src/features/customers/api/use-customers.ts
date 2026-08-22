import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateCustomerBankAccountInput,
  UpdateCustomerBankAccountInput,
} from '../types';
import {
  allocatePayment,
  createCustomerBankAccount,
  deactivateCustomerBankAccount,
  fetchCustomer,
  fetchCustomerBankAccounts,
  fetchCustomerCredits,
  fetchCustomers,
  fetchCustomerTimeline,
  updateCustomerBankAccount,
} from './customers-api';

interface UpdateCustomerBankAccountMutationVariables {
  id: string;
  input: UpdateCustomerBankAccountInput;
}

export function useCustomers(search = '', page = 1, enabled = true) {
  return useQuery({
    queryKey: ['customers', search, page],
    queryFn: () => fetchCustomers(search, page),
    enabled,
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: ['customer', id],
    queryFn: () => fetchCustomer(id),
    enabled: id.length > 0,
  });
}

export function useCustomerTimeline(customerId: string, page = 1) {
  return useQuery({
    queryKey: ['customer-timeline', customerId, page],
    queryFn: () => fetchCustomerTimeline(customerId, page),
    enabled: customerId.length > 0,
  });
}

export function useCustomerCredits(customerId: string) {
  return useQuery({
    queryKey: ['customer-credits', customerId],
    queryFn: () => fetchCustomerCredits(customerId),
    enabled: customerId.length > 0,
  });
}

export function useInvalidateCustomers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['customers'] });
}

export function useAllocatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      paymentId: string;
      receivableId: string;
      amount: number;
    }) =>
      allocatePayment(input.paymentId, {
        receivableId: input.receivableId,
        amount: input.amount,
      }),
    onSuccess: (_, input) => {
      void queryClient.invalidateQueries({ queryKey: ['customer-credits'] });
      void queryClient.invalidateQueries({ queryKey: ['receivables'] });
      void queryClient.invalidateQueries({
        queryKey: ['receivable', input.receivableId],
      });
    },
  });
}

export const customerBankAccountsKey = (customerId: string) =>
  ['customer-bank-accounts', customerId] as const;

export function useCustomerBankAccounts(customerId: string) {
  return useQuery({
    queryKey: customerBankAccountsKey(customerId),
    queryFn: () => fetchCustomerBankAccounts(customerId),
    enabled: customerId.length > 0,
  });
}

export function useCreateCustomerBankAccount(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerBankAccountInput) =>
      createCustomerBankAccount(customerId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: customerBankAccountsKey(customerId),
      });
    },
  });
}

export function useUpdateCustomerBankAccount(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: UpdateCustomerBankAccountMutationVariables) =>
      updateCustomerBankAccount(customerId, id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: customerBankAccountsKey(customerId),
      });
    },
  });
}

export function useDeactivateCustomerBankAccount(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateCustomerBankAccount(customerId, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: customerBankAccountsKey(customerId),
      });
    },
  });
}
