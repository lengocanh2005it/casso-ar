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

    const changed = account
      .changeAccountNumber('44556677', 'user-9', new Date('2026-09-04'))
      .setActive(true);

    expect(changed).toMatchObject({
      id: account.id,
      organizationId: account.organizationId,
      customerId: account.customerId,
      accountNumber: '44556677',
      isActive: true,
    });
  });

  it('re-stamps confirmation provenance when the account number changes', () => {
    const account = new CustomerBankAccount({
      id: 'a1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      accountNumber: '0123456789',
      isActive: true,
      confirmedByUserId: 'old-user',
      confirmedAt: new Date('2026-08-01T00:00:00.000Z'),
      createdAt: new Date('2026-08-01'),
      updatedAt: new Date('2026-08-01'),
    });

    const at = new Date('2026-09-04T00:00:00.000Z');
    const changed = account.changeAccountNumber('99887766', 'new-user', at);

    expect(changed.accountNumber).toBe('99887766');
    expect(changed.confirmedByUserId).toBe('new-user');
    expect(changed.confirmedAt).toEqual(at);
  });

  it('carries confirmation provenance and preserves it across transitions', () => {
    const confirmedAt = new Date('2026-09-03T00:00:00.000Z');
    const account = new CustomerBankAccount({
      id: 'a1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      accountNumber: '0123456789',
      isActive: true,
      confirmedByUserId: 'user-1',
      confirmedAt,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    });

    expect(account.confirmedByUserId).toBe('user-1');
    expect(account.confirmedAt).toEqual(confirmedAt);

    const deactivated = account.deactivate();
    expect(deactivated.confirmedByUserId).toBe('user-1');
    expect(deactivated.confirmedAt).toEqual(confirmedAt);
    expect(deactivated.isActive).toBe(false);
  });

  it('allows null provenance for legacy rows', () => {
    const account = new CustomerBankAccount({
      id: 'a2',
      organizationId: 'org-1',
      customerId: 'cust-1',
      accountNumber: '0123456789',
      isActive: true,
      confirmedByUserId: null,
      confirmedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(account.confirmedByUserId).toBeNull();
    expect(account.confirmedAt).toBeNull();
  });
});
