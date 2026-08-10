import { CustomerBankAccount } from './customer-bank-account';

describe('CustomerBankAccount', () => {
  it('holds a tenant-owned account mapping', () => {
    expect(
      new CustomerBankAccount({
        id: 'account-1',
        organizationId: 'org-1',
        customerId: 'customer-1',
        accountNumber: '0011002233',
        isActive: true,
        createdAt: new Date('2026-08-01'),
        updatedAt: new Date('2026-08-01'),
      }),
    ).toMatchObject({ organizationId: 'org-1', customerId: 'customer-1' });
  });

  it('deactivates a mapping without changing its identity', () => {
    const account = new CustomerBankAccount({
      id: 'account-1',
      organizationId: 'org-1',
      customerId: 'customer-1',
      accountNumber: '0011002233',
      isActive: true,
      createdAt: new Date('2026-08-01'),
      updatedAt: new Date('2026-08-01'),
    });

    const deactivated = account.deactivate();

    expect(deactivated).toMatchObject({
      id: account.id,
      customerId: account.customerId,
      accountNumber: account.accountNumber,
      isActive: false,
    });
    expect(deactivated.updatedAt).not.toBe(account.updatedAt);
  });

  it('changes account number and active state while preserving ownership', () => {
    const account = new CustomerBankAccount({
      id: 'account-1',
      organizationId: 'org-1',
      customerId: 'customer-1',
      accountNumber: '0011002233',
      isActive: false,
      createdAt: new Date('2026-08-01'),
      updatedAt: new Date('2026-08-01'),
    });

    const changed = account.changeAccountNumber('44556677').setActive(true);

    expect(changed).toMatchObject({
      id: account.id,
      organizationId: account.organizationId,
      customerId: account.customerId,
      accountNumber: '44556677',
      isActive: true,
    });
  });
});
