import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchCustomer,
  fetchCustomerCredits,
  fetchCustomers,
  fetchCustomerTimeline,
} from './customers-api';

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
