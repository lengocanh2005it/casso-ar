import type {
  Customer,
  CustomerTimelineItem,
} from '@/features/customers/types';
import { apiRequest } from '@/lib/api-client';

export interface CustomerPage {
  items: Customer[];
  total: number;
  page: number;
  limit: number;
}

export function fetchCustomers(
  search: string,
  page: number,
): Promise<CustomerPage> {
  return apiRequest<CustomerPage>({
    url: '/api/v1/customers',
    method: 'GET',
    params: { search, page, limit: 20 },
  });
}

export function fetchCustomer(id: string): Promise<Customer> {
  return apiRequest<Customer>({
    url: `/api/v1/customers/${id}`,
    method: 'GET',
  });
}

export function fetchCustomerTimeline(
  customerId: string,
): Promise<CustomerTimelineItem[]> {
  return apiRequest<CustomerTimelineItem[]>({
    url: `/api/v1/customers/${customerId}/timeline`,
    method: 'GET',
  });
}
