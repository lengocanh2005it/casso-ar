import { CustomerGroup } from './customer-group';

export interface Customer {
  id: string;
  organizationId: string;
  name: string;
  taxCode: string;
  email: string;
  phone: string;
  defaultPaymentTermDays: number;
  creditLimit: number;
  priority: number;
  customerGroup: CustomerGroup;
  createdAt: Date;
}
