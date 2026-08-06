import { CustomerBankAccount } from './customer-bank-account';

describe('CustomerBankAccount', () => {
  it('holds a tenant-owned account mapping', () => {
    expect(
      new CustomerBankAccount({
        id: 'account-1',
        organizationId: 'org-1',
        customerId: 'customer-1',
        accountNumber: '0011002233',
        createdAt: new Date('2026-08-01'),
      }),
    ).toMatchObject({ organizationId: 'org-1', customerId: 'customer-1' });
  });
});
