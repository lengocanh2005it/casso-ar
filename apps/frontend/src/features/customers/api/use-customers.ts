import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchCustomer,
  fetchCustomers,
  fetchCustomerTimeline,
} from './customers-api';

export function useCustomers(search = '', page = 1) {
  return useQuery({
    queryKey: ['customers', search, page],
    queryFn: () => fetchCustomers(search, page),
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: ['customer', id],
    queryFn: () => fetchCustomer(id),
    enabled: id.length > 0,
  });
}

export function useCustomerTimeline(customerId: string) {
  return useQuery({
    queryKey: ['customer-timeline', customerId],
    queryFn: () => fetchCustomerTimeline(customerId),
    enabled: customerId.length > 0,
  });
}

export function useInvalidateCustomers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['customers'] });
}
