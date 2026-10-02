import { TypeOrmMatchingCandidateRepository } from './typeorm-matching-candidate.repository';

describe('TypeOrmMatchingCandidateRepository.findRunnerUpScoresByBankTransactionIds', () => {
  const build = (
    rows: Array<{ bankTransactionId: string; totalScore: number }>,
  ) => {
    const find = jest.fn().mockResolvedValue(rows);
    const repo = new TypeOrmMatchingCandidateRepository(
      { find } as never,
      { getOrganizationId: () => 'org-1' } as never,
    );
    return { repo, find };
  };

  it('returns the second-highest score per transaction and omits single-candidate transactions', async () => {
    // Rows arrive ordered by totalScore DESC, interleaved across transactions.
    const { repo, find } = build([
      { bankTransactionId: 'bt-1', totalScore: 95 },
      { bankTransactionId: 'bt-2', totalScore: 90 },
      { bankTransactionId: 'bt-1', totalScore: 91 },
      { bankTransactionId: 'bt-1', totalScore: 40 },
      { bankTransactionId: 'bt-3', totalScore: 70 },
      { bankTransactionId: 'bt-2', totalScore: 60 },
    ]);

    const result = await repo.findRunnerUpScoresByBankTransactionIds([
      'bt-1',
      'bt-2',
      'bt-3',
    ]);

    expect(result).toEqual(
      new Map([
        ['bt-1', 91],
        ['bt-2', 60],
      ]),
    );
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1' }),
        order: { totalScore: 'DESC' },
      }),
    );
  });

  it('does not query when there are no transaction ids', async () => {
    const { repo, find } = build([]);

    await expect(
      repo.findRunnerUpScoresByBankTransactionIds([]),
    ).resolves.toEqual(new Map());
    expect(find).not.toHaveBeenCalled();
  });
});
