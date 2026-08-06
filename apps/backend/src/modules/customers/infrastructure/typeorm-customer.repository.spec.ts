import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import type { Customer } from '../domain/customer';
import { TypeOrmCustomerRepository } from './typeorm-customer.repository';

const PROPS: Customer = {
  id: 'cus-1',
  organizationId: 'org-1',
  name: 'Acme Co',
  taxCode: '0101234567',
  email: 'acme@example.com',
  phone: '0900000000',
  defaultPaymentTermDays: 30,
  creditLimit: 5_000_000,
  priority: 1,
  createdAt: new Date('2026-07-01'),
};

describe('TypeOrmCustomerRepository', () => {
  it('maps a domain Customer to a plain ORM entity', async () => {
    const ormRepo = { save: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmCustomerRepository(ormRepo as any, tenantContext);

    await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repo.save(PROPS),
    );

    expect(ormRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cus-1',
        organizationId: 'org-1',
        name: 'Acme Co',
        creditLimit: 5_000_000,
      }),
    );
    const saved = ormRepo.save.mock.calls[0][0];
    expect(saved).toEqual(PROPS);
  });
});
