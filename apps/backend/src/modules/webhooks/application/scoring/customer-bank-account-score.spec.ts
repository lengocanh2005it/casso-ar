import { customerBankAccountScore } from './customer-bank-account-score';

describe('customerBankAccountScore', () => {
  it('scores a known account only', () => {
    expect(customerBankAccountScore('0011002233', ['0011002233'])).toBe(10);
    expect(customerBankAccountScore('0011002233', ['0099998888'])).toBe(0);
  });
});
