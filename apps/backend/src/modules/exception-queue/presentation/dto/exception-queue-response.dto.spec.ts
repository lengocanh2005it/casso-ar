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
});
