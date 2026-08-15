import type { Customer } from '../../domain/customer';

export class CustomerResponseDto {
  id: string;
  name: string;
  taxCode: string;
  email: string;
  phone: string;
  defaultPaymentTermDays: number;
  creditLimit: number;
  priority: number;
  createdAt: Date;
}

export class ListCustomersResponseDto {
  items: CustomerResponseDto[];
  total: number;
  page: number;
  limit: number;
}

export function toCustomerResponse(customer: Customer): CustomerResponseDto {
  return {
    id: customer.id,
    name: customer.name,
    taxCode: customer.taxCode,
    email: customer.email,
    phone: customer.phone,
    defaultPaymentTermDays: customer.defaultPaymentTermDays,
    creditLimit: customer.creditLimit,
    priority: customer.priority,
    createdAt: customer.createdAt,
  };
}
