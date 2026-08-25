import { ReceivableStatus } from '@casso-ar/shared-types';
import { Receivable } from './receivable';

function buildOpenReceivable(originalAmount: number): Receivable {
  return new Receivable({
    id: 'rec-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    invoiceId: 'inv-1',
    originalAmount,
    paidAmount: 0,
    dueDate: new Date('2026-08-20'),
    status: ReceivableStatus.OPEN,
    salesRepresentativeId: 'user-1',
    createdAt: new Date('2026-07-20'),
    closedAt: null,
    version: 1,
  });
}

describe('Receivable domain entity', () => {
  it('transitions OPEN -> PARTIALLY_PAID when partially allocated', () => {
    const receivable = buildOpenReceivable(50_000_000);
    const updated = receivable.applyPaymentAllocation(30_000_000);

    expect(updated.paidAmount).toBe(30_000_000);
    expect(updated.remainingAmount).toBe(20_000_000);
    expect(updated.status).toBe(ReceivableStatus.PARTIALLY_PAID);
  });

  it('transitions to PAID when remainingAmount reaches 0', () => {
    const receivable =
      buildOpenReceivable(50_000_000).applyPaymentAllocation(30_000_000);
    const updated = receivable.applyPaymentAllocation(20_000_000);

    expect(updated.remainingAmount).toBe(0);
    expect(updated.status).toBe(ReceivableStatus.PAID);
  });

  it('throws when allocation would exceed remainingAmount', () => {
    const receivable = buildOpenReceivable(50_000_000);
    expect(() => receivable.applyPaymentAllocation(60_000_000)).toThrow(
      'Allocation amount exceeds remaining amount',
    );
  });

  it('allows WRITTEN_OFF from OPEN and PARTIALLY_PAID', () => {
    const open = buildOpenReceivable(50_000_000);
    expect(open.writeOff().status).toBe(ReceivableStatus.WRITTEN_OFF);

    const partiallyPaid = open.applyPaymentAllocation(30_000_000);
    expect(partiallyPaid.writeOff().status).toBe(ReceivableStatus.WRITTEN_OFF);
  });

  it('allows CANCELLED only when paidAmount is 0', () => {
    const open = buildOpenReceivable(50_000_000);
    expect(open.cancel().status).toBe(ReceivableStatus.CANCELLED);

    const partiallyPaid = open.applyPaymentAllocation(30_000_000);
    expect(() => partiallyPaid.cancel()).toThrow(
      'Cannot cancel a receivable that has received payment',
    );
  });

  it('computes isOverdue as true only when OPEN/PARTIALLY_PAID and past dueDate', () => {
    const overdue = buildOpenReceivable(50_000_000);
    expect(overdue.isOverdue(new Date('2026-08-21'))).toBe(true);
    expect(overdue.isOverdue(new Date('2026-08-19'))).toBe(false);

    const paid = overdue.applyPaymentAllocation(50_000_000);
    expect(paid.isOverdue(new Date('2026-08-21'))).toBe(false);
  });
});
