export interface Customer {
  id: string;
  name: string;
  taxCode: string | null;
  email: string | null;
  phone: string | null;
  defaultPaymentTermDays: number;
  creditLimit: number | null;
  priority: number | null;
  createdAt: string;
}

export interface CustomerTimelineItem {
  id: string;
  receivableId: string;
  activityType: string;
  description: string;
  metadata: Record<string, unknown> | null;
  createdByUserId: string | null;
  createdAt: string;
}

export interface CustomerBankAccount {
  id: string;
  customerId: string;
  accountNumberMasked: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerBankAccountList {
  items: CustomerBankAccount[];
  total: number;
}

export interface CreateCustomerBankAccountInput {
  accountNumber: string;
}

export interface UpdateCustomerBankAccountInput {
  accountNumber?: string;
  isActive?: boolean;
}
