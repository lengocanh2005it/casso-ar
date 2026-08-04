import type {
  InvoiceSourceType,
  InvoiceStatus,
} from '@casso-ledger/shared-types';

export interface Invoice {
  id: string;
  organizationId: string;
  customerId: string;
  invoiceNumber: string;
  issueDate: Date;
  totalAmount: number;
  taxAmount: number;
  sourceType: InvoiceSourceType;
  fileUrl: string | null;
  status: InvoiceStatus;
  createdAt: Date;
}
