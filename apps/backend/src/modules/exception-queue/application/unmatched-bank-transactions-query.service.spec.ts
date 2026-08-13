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

    const service = new UnmatchedBankTransactionsQueryService(
      bankTransactionRepo as never,
      matchingCandidateRepo as never,
    );

    await expect(service.execute()).resolves.toEqual({
      items: [
        {
          transaction: { id: 'bt-1' },
          topCandidate: { id: 'mc-1', totalScore: 80 },
        },
        { transaction: { id: 'bt-2' }, topCandidate: null },
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

    const service = new UnmatchedBankTransactionsQueryService(
      bankTransactionRepo as never,
      matchingCandidateRepo as never,
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

    const service = new UnmatchedBankTransactionsQueryService(
      bankTransactionRepo as never,
      matchingCandidateRepo as never,
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
});
