import { timingScore } from './timing-score';

describe('timingScore', () => {
  it('scores transactions within thirty days of due date', () => {
    expect(timingScore(new Date('2026-08-05'), new Date('2026-08-20'))).toBe(5);
    expect(timingScore(new Date('2026-09-10'), new Date('2026-08-20'))).toBe(5);
    expect(timingScore(new Date('2026-06-01'), new Date('2026-08-20'))).toBe(0);
  });
});
