import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import { AuditContextService } from '../../../common/audit/audit-context';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from '../../customers/application/customer-repository.port';
import type { CustomerBankAccount } from '../domain/customer-bank-account';
import {
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
  acknowledgeExistingLinks?: boolean;
  confirmedByUserId?: string | null;
}

@Injectable()
export class UpdateCustomerBankAccountUseCase {
  constructor(
    @Inject(CUSTOMER_BANK_ACCOUNT_REPOSITORY)
    private readonly bankAccountRepo: ICustomerBankAccountRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    private readonly tenantContext: TenantContextService,
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
      if (accountNumber !== account.accountNumber) {
        const activeLinks =
          await this.bankAccountRepo.findActiveByAccountNumber(accountNumber);

        if (
          activeLinks.some(
            (link) =>
              link.customerId === account.customerId && link.id !== account.id,
          )
        ) {
          throw new AppError(
            ErrorCode.CONFLICT,
            'Số tài khoản ngân hàng đã được liên kết.',
          );
        }

        const otherCustomerIds = [
          ...new Set(
            activeLinks
              .filter((link) => link.customerId !== account.customerId)
              .map((link) => link.customerId),
          ),
        ];

        if (
          otherCustomerIds.length > 0 &&
          input.acknowledgeExistingLinks !== true
        ) {
          const names = await this.customerRepo.findByIds(otherCustomerIds);
          throw new AppError(
            ErrorCode.CONFLICT,
            'Số tài khoản này đang liên kết với khách hàng khác.',
            {
              linkedCustomerNames: otherCustomerIds
                .map((id) => names.get(id)?.name)
                .filter((name): name is string => Boolean(name)),
            },
          );
        }

        const confirmedByUserId =
          input.confirmedByUserId ??
          (otherCustomerIds.length > 0
            ? (this.tenantContext.getCurrentUser()?.userId ?? null)
            : null);
        const confirmedAt = otherCustomerIds.length > 0 ? new Date() : null;

        next = next.changeAccountNumber(
          accountNumber,
          confirmedByUserId,
          confirmedAt,
        );
      }
    }
    if (input.isActive !== undefined) {
      next = next.setActive(input.isActive);
    }

    await this.bankAccountRepo.save(next, manager);
    return next;
  }
}
