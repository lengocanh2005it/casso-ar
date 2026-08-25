import { ReceivableStatus } from '@casso-ar/shared-types';
import { CustomerGroup } from '../src/modules/customers/domain/customer-group';
import type { ReminderCandidate } from '../src/modules/reminders/application/reminder-candidate-reader.port';

export function buildReminderCandidate(
  overrides: Partial<ReminderCandidate> = {},
): ReminderCandidate {
  return {
    receivableId: 'rec-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    customerGroup: CustomerGroup.VIP,
    customerName: 'Company B',
    customerEmail: 'ap@congtyb.vn',
    invoiceNumber: 'INV-001',
    originalAmount: 50_000_000,
    paidAmount: 0,
    remainingAmount: 50_000_000,
    dueDate: new Date('2026-08-08'),
    status: ReceivableStatus.OPEN,
    isDisputed: false,
    ...overrides,
  };
}
