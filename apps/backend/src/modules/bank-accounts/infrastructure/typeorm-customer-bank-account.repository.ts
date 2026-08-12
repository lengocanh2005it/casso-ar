import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, FindOptionsSelect, Repository } from 'typeorm';
import { isUniqueViolation } from '../../../common/database/unique-violation';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { normalizeAccountNumber } from '../application/account-number-normalizer';
import type { ICustomerBankAccountRepository } from '../application/customer-bank-account-repository.port';
import { CustomerBankAccount } from '../domain/customer-bank-account';
import { CustomerBankAccountOrmEntity } from './customer-bank-account.orm-entity';

const CUSTOMER_BANK_ACCOUNT_SELECT = {
  id: true,
  organizationId: true,
  customerId: true,
  accountNumber: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies FindOptionsSelect<CustomerBankAccountOrmEntity>;

function toOrm(account: CustomerBankAccount): CustomerBankAccountOrmEntity {
  return {
    id: account.id,
    organizationId: account.organizationId,
    customerId: account.customerId,
    accountNumber: account.accountNumber,
    isActive: account.isActive,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function toDomain(row: CustomerBankAccountOrmEntity): CustomerBankAccount {
  return new CustomerBankAccount({
    id: row.id,
    organizationId: row.organizationId,
    customerId: row.customerId,
    accountNumber: row.accountNumber,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

@Injectable()
export class TypeOrmCustomerBankAccountRepository
  extends BaseRepository<CustomerBankAccountOrmEntity>
  implements ICustomerBankAccountRepository
{
  constructor(
    @InjectRepository(CustomerBankAccountOrmEntity)
    repo: Repository<CustomerBankAccountOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findByAccountNumber(
    accountNumber: string,
  ): Promise<CustomerBankAccount | null> {
    const row = await this.scopedFindOne({
      accountNumber: normalizeAccountNumber(accountNumber),
      isActive: true,
    });
    return row ? toDomain(row) : null;
  }

  async findByCustomerId(customerId: string): Promise<CustomerBankAccount[]> {
    const rows = await this.scopedFindMany(
      { customerId },
      {
        select: CUSTOMER_BANK_ACCOUNT_SELECT,
        order: { createdAt: 'DESC' },
      },
    );
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<CustomerBankAccount | null> {
    const row = await this.scopedFindOne({ id });
    return row ? toDomain(row) : null;
  }

  async save(
    account: CustomerBankAccount,
    manager?: EntityManager,
  ): Promise<void> {
    try {
      await this.scopedSaveWithManager(toOrm(account), manager);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Số tài khoản ngân hàng đã được liên kết.',
        );
      }
      throw error;
    }
  }
}
