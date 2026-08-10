import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import { AuditContextService } from '../../../common/audit/audit-context';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { CustomerBankAccount } from '../domain/customer-bank-account';
import {
  isUniqueViolation,
  normalizeOrThrow,
  toAuditedBankAccount,
} from './account-number-normalizer';
import {
  CUSTOMER_BANK_ACCOUNT_REPOSITORY,
  type ICustomerBankAccountRepository,
} from './customer-bank-account-repository.port';

export interface UpdateCustomerBankAccountInput {
  id: string;
  customerId: string;
  accountNumber?: string;
  isActive?: boolean;
}

@Injectable()
export class UpdateCustomerBankAccountUseCase {
  constructor(
    @Inject(CUSTOMER_BANK_ACCOUNT_REPOSITORY)
    private readonly bankAccountRepo: ICustomerBankAccountRepository,
    private readonly dataSource: DataSource,
    private readonly auditContext: AuditContextService,
  ) {}

  async execute(
    input: UpdateCustomerBankAccountInput,
  ): Promise<CustomerBankAccount> {
    return this.dataSource.transaction((manager: EntityManager) =>
      this.updateWithinTransaction(input, manager),
    );
  }

  private async updateWithinTransaction(
    input: UpdateCustomerBankAccountInput,
    manager: EntityManager,
  ): Promise<CustomerBankAccount> {
    const account = await this.bankAccountRepo.findById(input.id);
    if (!account || account.customerId !== input.customerId) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy tài khoản ngân hàng của khách hàng.',
      );
    }
    if (input.accountNumber === undefined && input.isActive === undefined) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Cần cung cấp ít nhất một trường để cập nhật.',
      );
    }

    this.auditContext.setBefore(toAuditedBankAccount(account));
    let next = account;
    if (input.accountNumber !== undefined) {
      const accountNumber = normalizeOrThrow(input.accountNumber);
      const existing =
        await this.bankAccountRepo.findByAccountNumber(accountNumber);
      if (existing && existing.id !== account.id) {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Số tài khoản ngân hàng đã được liên kết.',
        );
      }
      if (accountNumber !== account.accountNumber) {
        next = next.changeAccountNumber(accountNumber);
      }
    }
    if (input.isActive !== undefined) {
      next = next.setActive(input.isActive);
    }

    try {
      await this.bankAccountRepo.save(next, manager);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Số tài khoản ngân hàng đã được liên kết.',
        );
      }
      throw error;
    }
    return next;
  }
}
