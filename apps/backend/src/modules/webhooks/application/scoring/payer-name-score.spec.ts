import { payerNameScore } from './payer-name-score';

describe('payerNameScore', () => {
  it('scores close names and rejects unrelated names', () => {
    expect(payerNameScore('COMPANY B', 'Company B')).toBe(5);
    expect(payerNameScore('B LLC', 'Company B')).toBe(5);
    expect(payerNameScore('NGUYEN VAN A', 'Company B')).toBe(0);
  });
});
