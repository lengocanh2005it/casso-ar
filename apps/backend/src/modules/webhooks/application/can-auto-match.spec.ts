import { canAutoMatch } from './can-auto-match';

const candidate = (totalScore: number, remainingAmount = 1_000_000) => ({
  totalScore,
  remainingAmount,
});

describe('canAutoMatch', () => {
  it.each([
    ['there is no candidate', [], 1_000_000, false],
    [
      'a single candidate clears the threshold (no runner-up)',
      [candidate(90)],
      1_000_000,
      true,
    ],
    [
      'the top score is below the threshold',
      [candidate(89), candidate(40)],
      1_000_000,
      false,
    ],
    [
      'the transaction exceeds the top remaining amount',
      [candidate(95, 500_000), candidate(40)],
      1_000_000,
      false,
    ],
    [
      'two candidates tie at the top',
      [candidate(95), candidate(95)],
      1_000_000,
      false,
    ],
    [
      'the lead is one point under the margin',
      [candidate(95), candidate(86)],
      1_000_000,
      false,
    ],
    [
      'the lead is exactly the margin',
      [candidate(95), candidate(85)],
      1_000_000,
      true,
    ],
    [
      'the lead is above the margin',
      [candidate(95), candidate(70)],
      1_000_000,
      true,
    ],
    [
      'the top is exactly the threshold with a clear lead',
      [candidate(90), candidate(80)],
      1_000_000,
      true,
    ],
    [
      'the runner-up is far below but the top is 100',
      [candidate(100), candidate(90)],
      1_000_000,
      true,
    ],
  ])('when %s', (_name, candidates, amount, expected) => {
    expect(canAutoMatch(candidates, amount)).toBe(expected);
  });

  it('judges only the top two candidates, regardless of how many follow', () => {
    expect(
      canAutoMatch([candidate(95), candidate(60), candidate(59)], 1_000_000),
    ).toBe(true);
  });
});
