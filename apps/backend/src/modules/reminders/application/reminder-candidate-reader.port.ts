import type { ReceivableStatus } from '@casso-ar/shared-types';
import type { CustomerGroup } from '../../customers/domain/customer-group';

export interface ReminderCandidate {
  receivableId: string;
  organizationId: string;
  customerId: string;
  customerGroup: CustomerGroup;
  customerName: string;
  customerEmail: string;
  invoiceNumber: string | null;
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: Date;
  status: ReceivableStatus;
  isDisputed: boolean;
}

export interface IReminderCandidateReader {
  findOpenCandidates(): Promise<ReminderCandidate[]>;
  findByReceivableId(receivableId: string): Promise<ReminderCandidate | null>;
}
