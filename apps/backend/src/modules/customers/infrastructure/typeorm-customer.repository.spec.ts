import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import type { Customer } from '../domain/customer';
import { CustomerGroup } from '../domain/customer-group';
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
  customerGroup: CustomerGroup.REGULAR,
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

  it('finds customers through the transaction manager when supplied', async () => {
    const ormRepo = { findOne: jest.fn() };
    const managerRepo = { findOne: jest.fn().mockResolvedValue(PROPS) };
    const manager = { getRepository: jest.fn().mockReturnValue(managerRepo) };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmCustomerRepository(ormRepo as any, tenantContext);

    await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      async () => {
        await expect(repo.findById('cus-1', manager as any)).resolves.toEqual(
          PROPS,
        );
        await expect(
          repo.findByTaxCode('0101234567', manager as any),
        ).resolves.toEqual(PROPS);
        await expect(
          repo.findByEmail('acme@example.com', manager as any),
        ).resolves.toEqual(PROPS);
      },
    );

    expect(ormRepo.findOne).not.toHaveBeenCalled();
    expect(managerRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'cus-1', organizationId: 'org-1' },
    });
    expect(managerRepo.findOne).toHaveBeenCalledWith({
      where: { taxCode: '0101234567', organizationId: 'org-1' },
    });
    expect(managerRepo.findOne).toHaveBeenCalledWith({
      where: { email: 'acme@example.com', organizationId: 'org-1' },
    });
  });

  it('finds customers through the tenant-scoped repository without a manager', async () => {
    const ormRepo = { findOne: jest.fn().mockResolvedValue(PROPS) };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmCustomerRepository(ormRepo as any, tenantContext);

    await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      async () => {
        await repo.findById('cus-1');
        await repo.findByTaxCode('0101234567');
        await repo.findByEmail('acme@example.com');
      },
    );

    expect(ormRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'cus-1', organizationId: 'org-1' },
    });
    expect(ormRepo.findOne).toHaveBeenCalledWith({
      where: { taxCode: '0101234567', organizationId: 'org-1' },
    });
    expect(ormRepo.findOne).toHaveBeenCalledWith({
      where: { email: 'acme@example.com', organizationId: 'org-1' },
    });
  });
});
