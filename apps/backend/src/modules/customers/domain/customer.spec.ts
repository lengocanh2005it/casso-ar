import type { Customer } from './customer';
import { CustomerGroup } from './customer-group';

describe('Customer domain', () => {
  it('has required fields', () => {
    const customer: Customer = {
      id: 'cust-1',
      organizationId: 'org-1',
      name: 'Công ty B',
      taxCode: '0312345678',
      email: 'ap@congtyb.vn',
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      customerGroup: CustomerGroup.REGULAR,
      createdAt: new Date('2026-01-01'),
    };

    expect(customer.id).toBe('cust-1');
    expect(customer.name).toBe('Công ty B');
    expect(customer.defaultPaymentTermDays).toBe(30);
  });

  it('stores the customer group used by reminder policy selection', () => {
    const customer: Customer = {
      id: 'cust-1',
      organizationId: 'org-1',
      name: 'Company B',
      taxCode: '0312345678',
      email: 'ap@congtyb.vn',
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      customerGroup: CustomerGroup.VIP,
      createdAt: new Date('2026-01-01'),
    };

    expect(customer.customerGroup).toBe(CustomerGroup.VIP);
  });
});
