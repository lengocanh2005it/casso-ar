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
});
