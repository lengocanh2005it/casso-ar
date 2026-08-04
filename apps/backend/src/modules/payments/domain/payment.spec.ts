import { Payment } from './payment';

describe('Payment domain entity', () => {
  it('computes unallocatedAmount from totalAmount minus allocated', () => {
    const payment = new Payment({
      id: 'pay-1',
      organizationId: 'org-1',
      customerId: 'customer-1',
      bankTransactionId: null,
      totalAmount: 25_000_000,
      allocatedAmount: 20_000_000,
      payerName: 'Công ty B',
      receivedAt: new Date('2026-08-01'),
      createdAt: new Date('2026-08-01'),
    });

    expect(payment.unallocatedAmount).toBe(5_000_000);
  });
});
