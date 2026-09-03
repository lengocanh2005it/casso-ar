import { toUnmatchedResponse } from './exception-queue-response.dto';

describe('exception queue response mapping', () => {
  it('exposes only the advisory fields and preserves freshness', () => {
    const response = toUnmatchedResponse({
      items: [
        {
          transaction: { id: 'bt-1' },
          topCandidate: null,
          aiRecommendation: {
            status: 'SUCCEEDED',
            recommendedReceivableId: 'rec-1',
            confidence: 80,
            reason: 'Khớp tên và số tiền.',
            isCurrent: false,
          },
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    } as never);

    expect(response.items[0]?.aiRecommendation).toEqual({
      status: 'SUCCEEDED',
      recommendedReceivableId: 'rec-1',
      confidence: 80,
      reason: 'Khớp tên và số tiền.',
      isCurrent: false,
    });
    expect(response.items[0]?.aiRecommendation).not.toHaveProperty('model');
    expect(response.items[0]?.aiRecommendation).not.toHaveProperty(
      'failureCode',
    );
  });

  it('maps the payer view including linked customers', () => {
    const response = toUnmatchedResponse({
      items: [
        {
          transaction: {
            id: 'bt-1',
            providerTransactionId: 'TX-1',
            amount: 1000000,
            transactionDateTime: new Date('2026-08-01'),
            counterpartyAccountNumber: '0123456789',
            counterpartyName: 'NGUYEN VAN A',
            transferContent: 'INV-1',
            status: 'PENDING_REVIEW',
            createdAt: new Date(),
            version: 1,
          },
          topCandidate: null,
          aiRecommendation: null,
          payer: {
            accountNumberMasked: '••••6789',
            name: 'NGUYEN VAN A',
            linkedCustomers: [{ customerId: 'c1', customerName: 'Cong ty A' }],
          },
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    } as never);

    expect(response.items[0].payer).toEqual({
      accountNumberMasked: '••••6789',
      name: 'NGUYEN VAN A',
      linkedCustomers: [{ customerId: 'c1', customerName: 'Cong ty A' }],
    });
  });
});
