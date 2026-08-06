import { amountScore } from './amount-score';

describe('amountScore', () => {
  it('scores exact and within-one-percent amounts', () => {
    expect(amountScore(30_000_000, 30_000_000)).toBe(20);
    expect(amountScore(30_000_000, 30_200_000)).toBe(10);
    expect(amountScore(30_000_000, 35_000_000)).toBe(0);
  });
});
