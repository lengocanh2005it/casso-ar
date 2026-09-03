import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from '../../customers/application/customer-repository.port';
import { CustomerBankAccount } from '../domain/customer-bank-account';
import { normalizeOrThrow } from './account-number-normalizer';
import {
  CUSTOMER_BANK_ACCOUNT_REPOSITORY,
  type ICustomerBankAccountRepository,
} from './customer-bank-account-repository.port';

export interface CreateCustomerBankAccountInput {
  customerId: string;
  accountNumber: string;
  confirmedByUserId?: string;
  acknowledgeExistingLinks?: boolean;
}

@Injectable()
export class CreateCustomerBankAccountUseCase {
  constructor(
    @Inject(CUSTOMER_BANK_ACCOUNT_REPOSITORY)
    private readonly bankAccountRepo: ICustomerBankAccountRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    private readonly tenantContext: TenantContextService,
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    input: CreateCustomerBankAccountInput,
  ): Promise<CustomerBankAccount> {
    return this.dataSource.transaction((manager: EntityManager) =>
      this.createWithinTransaction(input, manager),
    );
  }

  private async createWithinTransaction(
    input: CreateCustomerBankAccountInput,
    manager: EntityManager,
  ): Promise<CustomerBankAccount> {
    const customer = await this.customerRepo.findById(
      input.customerId,
      manager,
    );
    if (!customer) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy khách hàng.');
    }

    const accountNumber = normalizeOrThrow(input.accountNumber);
    const activeLinks =
      await this.bankAccountRepo.findActiveByAccountNumber(accountNumber);

    if (activeLinks.some((link) => link.customerId === customer.id)) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Số tài khoản ngân hàng đã được liên kết.',
      );
    }

    const otherCustomerIds = [
      ...new Set(activeLinks.map((link) => link.customerId)),
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

    const now = new Date();
    const account = new CustomerBankAccount({
      id: randomUUID(),
      organizationId: this.tenantContext.getOrganizationId(),
      customerId: customer.id,
      accountNumber,
      isActive: true,
      confirmedByUserId: input.confirmedByUserId ?? null,
      confirmedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await this.bankAccountRepo.save(account, manager);
    return account;
  }
}
