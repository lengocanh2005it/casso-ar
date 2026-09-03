import { ReceivableStatus } from '@casso-ar/shared-types';
import { toReceivableDetailResponse } from './receivable-response.dto';

describe('toReceivableDetailResponse', () => {
  it('returns null payment display metadata when an allocation references a missing payment', () => {
    const result = toReceivableDetailResponse(
      {
        id: 'receivable-1',
        customerId: 'customer-1',
        invoiceId: null,
        originalAmount: 10_000_000,
        paidAmount: 5_000_000,
        dueDate: new Date('2026-08-01'),
        status: ReceivableStatus.PARTIALLY_PAID,
        salesRepresentativeId: null,
        createdAt: new Date('2026-08-01'),
        closedAt: null,
      },
      false,
      null,
      [
        {
          id: 'allocation-1',
          paymentId: 'missing-payment',
          allocatedAmount: 5_000_000,
          allocatedAt: new Date('2026-08-01'),
          allocatedByUserId: null,
        },
      ],
      null,
      null,
      new Map(),
      false,
    );

    expect(result.allocations[0]).toMatchObject({
      paymentId: 'missing-payment',
      payerName: null,
      bankTransactionId: null,
      receivedAt: null,
    });
  });
});
