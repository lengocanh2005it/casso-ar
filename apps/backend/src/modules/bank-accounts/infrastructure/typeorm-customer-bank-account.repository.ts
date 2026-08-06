import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { ICustomerBankAccountRepository } from '../application/customer-bank-account-repository.port';
import { CustomerBankAccount } from '../domain/customer-bank-account';
import { CustomerBankAccountOrmEntity } from './customer-bank-account.orm-entity';

function toOrm(account: CustomerBankAccount): CustomerBankAccountOrmEntity {
  return Object.assign(new CustomerBankAccountOrmEntity(), account);
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
      accountNumber,
    } as FindOptionsWhere<CustomerBankAccountOrmEntity>);
    return row ? new CustomerBankAccount(row) : null;
  }

  async save(account: CustomerBankAccount): Promise<void> {
    await this.scopedSaveWithManager(
      toOrm(account),
      undefined,
      account.organizationId,
    );
  }
}
