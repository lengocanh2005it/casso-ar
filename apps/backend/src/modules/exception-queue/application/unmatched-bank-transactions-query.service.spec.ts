import { UnmatchedBankTransactionsQueryService } from './unmatched-bank-transactions-query.service';

describe('UnmatchedBankTransactionsQueryService', () => {
  it('pairs pending transactions with top candidates in one batch lookup', async () => {
    const transactions = [{ id: 'bt-1' }, { id: 'bt-2' }];
    const bankTransactionRepo = {
      findManyByStatus: jest.fn().mockResolvedValue(transactions),
      countByStatus: jest.fn().mockResolvedValue(2),
    };
    const matchingCandidateRepo = {
      findTopByBankTransactionIds: jest
        .fn()
        .mockResolvedValue(new Map([['bt-1', { id: 'mc-1', totalScore: 80 }]])),
    };
    const receivableRepo = { findOpenByIds: jest.fn().mockResolvedValue([]) };

    const service = new UnmatchedBankTransactionsQueryService(
      bankTransactionRepo as never,
      matchingCandidateRepo as never,
      receivableRepo as never,
    );

    await expect(service.execute()).resolves.toEqual({
      items: [
        {
          transaction: { id: 'bt-1' },
          topCandidate: { id: 'mc-1', totalScore: 80 },
          aiRecommendation: null,
        },
        {
          transaction: { id: 'bt-2' },
          topCandidate: null,
          aiRecommendation: null,
        },
      ],
      total: 2,
      page: 1,
      limit: 20,
    });
    expect(
      matchingCandidateRepo.findTopByBankTransactionIds,
    ).toHaveBeenCalledWith(['bt-1', 'bt-2']);
  });

  it('delegates paging to the repository via skip/take instead of loading the full queue', async () => {
    const bankTransactionRepo = {
      findManyByStatus: jest.fn().mockResolvedValue([]),
      countByStatus: jest.fn().mockResolvedValue(45),
    };
    const matchingCandidateRepo = {
      findTopByBankTransactionIds: jest.fn().mockResolvedValue(new Map()),
    };
    const receivableRepo = { findOpenByIds: jest.fn().mockResolvedValue([]) };

    const service = new UnmatchedBankTransactionsQueryService(
      bankTransactionRepo as never,
      matchingCandidateRepo as never,
      receivableRepo as never,
    );

    const result = await service.execute(3, 10);

    expect(bankTransactionRepo.findManyByStatus).toHaveBeenCalledWith(
      'PENDING_REVIEW',
      { skip: 20, take: 10 },
    );
    expect(result.total).toBe(45);
  });

  it('forwards a search term to the repository for both the page and the count', async () => {
    const bankTransactionRepo = {
      findManyByStatus: jest.fn().mockResolvedValue([]),
      countByStatus: jest.fn().mockResolvedValue(0),
    };
    const matchingCandidateRepo = {
      findTopByBankTransactionIds: jest.fn().mockResolvedValue(new Map()),
    };
    const receivableRepo = { findOpenByIds: jest.fn().mockResolvedValue([]) };

    const service = new UnmatchedBankTransactionsQueryService(
      bankTransactionRepo as never,
      matchingCandidateRepo as never,
      receivableRepo as never,
    );

    await service.execute(1, 20, 'nguyen van a');

    expect(bankTransactionRepo.findManyByStatus).toHaveBeenCalledWith(
      'PENDING_REVIEW',
      { skip: 0, take: 20, search: 'nguyen van a' },
    );
    expect(bankTransactionRepo.countByStatus).toHaveBeenCalledWith(
      'PENDING_REVIEW',
      'nguyen van a',
    );
  });

  it('marks a successful recommendation current only when its receivable is still open', async () => {
    const transaction = {
      id: 'bt-1',
      aiRecommendation: {
        status: 'SUCCEEDED',
        recommendedReceivableId: 'rec-1',
        confidence: 80,
        reason: 'Khớp.',
      },
    };
    const bankTransactionRepo = {
      findManyByStatus: jest.fn().mockResolvedValue([transaction]),
      countByStatus: jest.fn().mockResolvedValue(1),
    };
    const matchingCandidateRepo = {
      findTopByBankTransactionIds: jest.fn().mockResolvedValue(new Map()),
    };
    const receivableRepo = {
      findOpenByIds: jest.fn().mockResolvedValue([{ id: 'rec-1' }]),
    };
    const service = new UnmatchedBankTransactionsQueryService(
      bankTransactionRepo as never,
      matchingCandidateRepo as never,
      receivableRepo as never,
    );

    await expect(service.execute()).resolves.toMatchObject({
      items: [
        {
          aiRecommendation: {
            status: 'SUCCEEDED',
            recommendedReceivableId: 'rec-1',
            confidence: 80,
            reason: 'Khớp.',
            isCurrent: true,
          },
        },
      ],
    });
    expect(receivableRepo.findOpenByIds).toHaveBeenCalledWith(['rec-1']);
  });

  it('keeps a stale recommendation as history with isCurrent false', async () => {
    const transaction = {
      id: 'bt-1',
      aiRecommendation: {
        status: 'SUCCEEDED',
        recommendedReceivableId: 'rec-closed',
        confidence: 90,
        reason: 'Khớp số tiền.',
      },
    };
    const bankTransactionRepo = {
      findManyByStatus: jest.fn().mockResolvedValue([transaction]),
      countByStatus: jest.fn().mockResolvedValue(1),
    };
    const matchingCandidateRepo = {
      findTopByBankTransactionIds: jest.fn().mockResolvedValue(new Map()),
    };
    const receivableRepo = {
      findOpenByIds: jest.fn().mockResolvedValue([]),
    };
    const service = new UnmatchedBankTransactionsQueryService(
      bankTransactionRepo as never,
      matchingCandidateRepo as never,
      receivableRepo as never,
    );

    await expect(service.execute()).resolves.toMatchObject({
      items: [
        {
          aiRecommendation: {
            status: 'SUCCEEDED',
            recommendedReceivableId: 'rec-closed',
            isCurrent: false,
          },
        },
      ],
    });
  });

  it('returns abstained and failed states without a candidate suggestion', async () => {
    const transactions = [
      {
        id: 'bt-abstain',
        aiRecommendation: {
          status: 'ABSTAINED',
          recommendedReceivableId: null,
          confidence: 40,
          reason: 'Không đủ dữ kiện.',
        },
      },
      {
        id: 'bt-failed',
        aiRecommendation: {
          status: 'FAILED',
          recommendedReceivableId: null,
          confidence: null,
          reason: null,
          failureCode: 'TIMEOUT',
        },
      },
    ];
    const bankTransactionRepo = {
      findManyByStatus: jest.fn().mockResolvedValue(transactions),
      countByStatus: jest.fn().mockResolvedValue(2),
    };
    const matchingCandidateRepo = {
      findTopByBankTransactionIds: jest.fn().mockResolvedValue(new Map()),
    };
    const receivableRepo = { findOpenByIds: jest.fn().mockResolvedValue([]) };
    const service = new UnmatchedBankTransactionsQueryService(
      bankTransactionRepo as never,
      matchingCandidateRepo as never,
      receivableRepo as never,
    );

    await expect(service.execute()).resolves.toMatchObject({
      items: [
        { aiRecommendation: { status: 'ABSTAINED', isCurrent: false } },
        { aiRecommendation: { status: 'FAILED', isCurrent: false } },
      ],
    });
    expect(receivableRepo.findOpenByIds).not.toHaveBeenCalled();
  });
});
