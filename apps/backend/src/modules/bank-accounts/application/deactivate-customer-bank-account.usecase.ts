import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import { AuditContextService } from '../../../common/audit/audit-context';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { CustomerBankAccount } from '../domain/customer-bank-account';
import { toAuditedBankAccount } from './account-number-normalizer';
import {
  CUSTOMER_BANK_ACCOUNT_REPOSITORY,
  type ICustomerBankAccountRepository,
} from './customer-bank-account-repository.port';

export interface DeactivateCustomerBankAccountInput {
  id: string;
  customerId: string;
}

@Injectable()
export class DeactivateCustomerBankAccountUseCase {
  constructor(
    @Inject(CUSTOMER_BANK_ACCOUNT_REPOSITORY)
    private readonly bankAccountRepo: ICustomerBankAccountRepository,
    private readonly dataSource: DataSource,
    private readonly auditContext: AuditContextService,
  ) {}

  async execute(
    input: DeactivateCustomerBankAccountInput,
  ): Promise<CustomerBankAccount> {
    return this.dataSource.transaction((manager: EntityManager) =>
      this.deactivateWithinTransaction(input, manager),
    );
  }

  private async deactivateWithinTransaction(
    input: DeactivateCustomerBankAccountInput,
    manager: EntityManager,
  ): Promise<CustomerBankAccount> {
    const account = await this.bankAccountRepo.findById(input.id);
    if (!account || account.customerId !== input.customerId) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy tài khoản ngân hàng của khách hàng.',
      );
    }
    if (!account.isActive) return account;

    this.auditContext.setBefore(toAuditedBankAccount(account));
    const next = account.deactivate();
    await this.bankAccountRepo.save(next, manager);
    return next;
  }
}
