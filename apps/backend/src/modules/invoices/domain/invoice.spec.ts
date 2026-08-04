import { InvoiceStatus } from '@casso-ledger/shared-types';
import type { Invoice } from './invoice';

describe('Invoice domain', () => {
  it('has required fields', () => {
    const invoice: Invoice = {
      id: 'inv-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      invoiceNumber: 'INV-2026-0012',
      issueDate: new Date('2026-07-20'),
      totalAmount: 50_000_000,
      taxAmount: 5_000_000,
      sourceType: 'MANUAL',
      fileUrl: null,
      status: InvoiceStatus.ISSUED,
      createdAt: new Date('2026-07-20'),
    };

    expect(invoice.invoiceNumber).toBe('INV-2026-0012');
    expect(invoice.status).toBe(InvoiceStatus.ISSUED);
  });
});
