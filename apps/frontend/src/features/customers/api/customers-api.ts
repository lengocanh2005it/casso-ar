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

export interface CustomerTimelinePage {
  items: CustomerTimelineItem[];
  total: number;
  page: number;
  limit: number;
}

export interface CustomerCredits {
  customerId: string;
  totalAvailableAmount: number;
  items: Array<{
    paymentId: string;
    totalAmount: number;
    allocatedAmount: number;
    unallocatedAmount: number;
    payerName: string;
    receivedAt: string;
  }>;
}

export function fetchCustomerCredits(
  customerId: string,
): Promise<CustomerCredits> {
  return apiRequest<CustomerCredits>({
    url: `/api/v1/customers/${customerId}/credits`,
    method: 'GET',
  });
}

export function fetchCustomerTimeline(
  customerId: string,
  page = 1,
): Promise<CustomerTimelinePage> {
  return apiRequest<CustomerTimelinePage>({
    url: `/api/v1/customers/${customerId}/timeline`,
    method: 'GET',
    params: { page, limit: 20 },
  });
}
