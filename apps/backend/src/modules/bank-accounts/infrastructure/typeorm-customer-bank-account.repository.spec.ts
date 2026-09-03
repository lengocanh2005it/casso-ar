import { QueryFailedError } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import { CustomerBankAccount } from '../domain/customer-bank-account';
import { TypeOrmCustomerBankAccountRepository } from './typeorm-customer-bank-account.repository';

const USER = { userId: 'user-1', organizationId: 'org-1', role: Role.OWNER };

function buildAccount(): CustomerBankAccount {
  return new CustomerBankAccount({
    id: 'account-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    accountNumber: '0011002233',
    isActive: true,
    createdAt: new Date('2026-08-12'),
    updatedAt: new Date('2026-08-12'),
  });
}

describe('TypeOrmCustomerBankAccountRepository', () => {
  it('translates a unique violation on save into a CONFLICT AppError', async () => {
    const ormRepo = {
      save: jest
        .fn()
        .mockRejectedValue(
          new QueryFailedError(
            'INSERT ...',
            [],
            Object.assign(new Error('duplicate key'), { code: '23505' }),
          ),
        ),
    };
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmCustomerBankAccountRepository(
      ormRepo as never,
      tenantContext,
    );

    await tenantContext.run(USER, async () => {
      await expect(repository.save(buildAccount())).rejects.toBeInstanceOf(
        AppError,
      );
      await expect(repository.save(buildAccount())).rejects.toMatchObject({
        errorCode: ErrorCode.CONFLICT,
      });
    });
  });

  it('rethrows non-unique errors unchanged', async () => {
    const dbError = new Error('connection reset');
    const ormRepo = { save: jest.fn().mockRejectedValue(dbError) };
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmCustomerBankAccountRepository(
      ormRepo as never,
      tenantContext,
    );

    await tenantContext.run(USER, async () => {
      await expect(repository.save(buildAccount())).rejects.toBe(dbError);
    });
  });

  it('findActiveByAccountNumber returns every active link across customers in the org', async () => {
    const rows = [
      {
        id: 'acc-1',
        organizationId: 'org-1',
        customerId: 'cust-1',
        accountNumber: '0123456789',
        isActive: true,
        confirmedByUserId: 'user-1',
        confirmedAt: new Date('2026-09-03'),
        createdAt: new Date('2026-09-02'),
        updatedAt: new Date('2026-09-02'),
      },
      {
        id: 'acc-2',
        organizationId: 'org-1',
        customerId: 'cust-2',
        accountNumber: '0123456789',
        isActive: true,
        confirmedByUserId: 'user-2',
        confirmedAt: new Date('2026-09-03'),
        createdAt: new Date('2026-09-01'),
        updatedAt: new Date('2026-09-01'),
      },
    ];
    const ormRepo = {
      find: jest.fn().mockResolvedValue(rows),
    };
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmCustomerBankAccountRepository(
      ormRepo as never,
      tenantContext,
    );

    await tenantContext.run(USER, async () => {
      const links = await repository.findActiveByAccountNumber('0123456789');
      expect(links.map((l) => l.customerId).sort()).toEqual([
        'cust-1',
        'cust-2',
      ]);
      expect(links.every((l) => l.isActive)).toBe(true);
      expect(ormRepo.find).toHaveBeenCalledWith({
        where: {
          accountNumber: '0123456789',
          isActive: true,
          organizationId: 'org-1',
        },
        select: expect.any(Object),
        order: { createdAt: 'DESC' },
      });
    });
  });

  it('save round-trips confirmation provenance', async () => {
    const confirmedAt = new Date('2026-09-03T00:00:00.000Z');
    const ormRepo = {
      save: jest.fn().mockResolvedValue({}),
    };
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmCustomerBankAccountRepository(
      ormRepo as never,
      tenantContext,
    );

    const account = new CustomerBankAccount({
      id: 'acc-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      accountNumber: '0123456789',
      isActive: true,
      confirmedByUserId: 'user-9',
      confirmedAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await tenantContext.run(USER, async () => {
      await repository.save(account);
      expect(ormRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          confirmedByUserId: 'user-9',
          confirmedAt,
        }),
      );
    });
  });
});
