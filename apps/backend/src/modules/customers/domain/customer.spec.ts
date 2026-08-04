import { Customer } from './customer';

describe('Customer domain entity', () => {
  it('creates a customer with required fields', () => {
    const customer = new Customer({
      id: 'cust-1',
      organizationId: 'org-1',
      name: 'Công ty B',
      taxCode: '0312345678',
      email: 'ap@congtyb.vn',
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: new Date('2026-01-01'),
    });

    expect(customer.id).toBe('cust-1');
    expect(customer.name).toBe('Công ty B');
    expect(customer.defaultPaymentTermDays).toBe(30);
  });
});
