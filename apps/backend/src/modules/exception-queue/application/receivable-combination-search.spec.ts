import { findReceivableCombinations } from './receivable-combination-search';

function receivable(receivableId: string, remainingAmount: number) {
  return { receivableId, remainingAmount };
}

describe('findReceivableCombinations', () => {
  it('returns every exact group with at least two receivables in deterministic order', () => {
    const result = findReceivableCombinations(
      [
        receivable('r-e', 100),
        receivable('r-d', 70),
        receivable('r-b', 60),
        receivable('r-a', 40),
        receivable('r-c', 30),
      ],
      100,
    );

    expect(result).toEqual({
      status: 'COMPLETE',
      combinations: [
        ['r-c', 'r-d'],
        ['r-a', 'r-b'],
      ],
    });
  });

  it('does not suggest a single receivable that equals the transfer amount', () => {
    expect(findReceivableCombinations([receivable('r-a', 100)], 100)).toEqual({
      status: 'COMPLETE',
      combinations: [],
    });
  });

  it('returns complete with no combinations when the search exhausts without an exact sum', () => {
    expect(
      findReceivableCombinations(
        [receivable('r-a', 40), receivable('r-b', 50)],
        100,
      ),
    ).toEqual({ status: 'COMPLETE', combinations: [] });
  });

  it('suppresses all combinations when receivable candidates exceed the limit', () => {
    const candidates = Array.from({ length: 101 }, (_, index) =>
      receivable(`r-${index.toString().padStart(3, '0')}`, 1),
    );

    expect(findReceivableCombinations(candidates, 2)).toEqual({
      status: 'INCOMPLETE',
      combinations: [],
    });
  });

  it('applies the candidate limit before filtering balances by transfer amount', () => {
    const candidates = Array.from({ length: 101 }, (_, index) =>
      receivable(`r-${index.toString().padStart(3, '0')}`, 100),
    );

    expect(findReceivableCombinations(candidates, 2)).toEqual({
      status: 'INCOMPLETE',
      combinations: [],
    });
  });

  it('does not claim completeness when the transfer amount is unsafe to sum exactly', () => {
    expect(
      findReceivableCombinations(
        [receivable('r-a', 1), receivable('r-b', 1)],
        Number.MAX_SAFE_INTEGER + 1,
      ),
    ).toEqual({ status: 'INCOMPLETE', combinations: [] });
  });

  it('suppresses all combinations when there are more than the result limit', () => {
    const candidates = Array.from({ length: 7 }, (_, index) =>
      receivable(`r-${index}`, 1),
    );

    expect(findReceivableCombinations(candidates, 2)).toEqual({
      status: 'INCOMPLETE',
      combinations: [],
    });
  });

  it('suppresses all combinations when the search-work limit prevents completion', () => {
    const candidates = Array.from({ length: 100 }, (_, index) =>
      receivable(`r-${index.toString().padStart(3, '0')}`, 2),
    );

    expect(findReceivableCombinations(candidates, 101)).toEqual({
      status: 'INCOMPLETE',
      combinations: [],
    });
  });
});
