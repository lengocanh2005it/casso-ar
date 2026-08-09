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
