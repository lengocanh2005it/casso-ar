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
