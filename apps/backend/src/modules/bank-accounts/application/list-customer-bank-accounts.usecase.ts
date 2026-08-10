import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from '../../customers/application/customer-repository.port';
import type { CustomerBankAccount } from '../domain/customer-bank-account';
import {
  CUSTOMER_BANK_ACCOUNT_REPOSITORY,
  type ICustomerBankAccountRepository,
} from './customer-bank-account-repository.port';

export interface ListCustomerBankAccountsInput {
  customerId: string;
}

@Injectable()
export class ListCustomerBankAccountsUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    @Inject(CUSTOMER_BANK_ACCOUNT_REPOSITORY)
    private readonly bankAccountRepo: ICustomerBankAccountRepository,
  ) {}

  async execute(
    input: ListCustomerBankAccountsInput,
  ): Promise<{ items: CustomerBankAccount[]; total: number }> {
    const customer = await this.customerRepo.findById(input.customerId);
    if (!customer) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy khách hàng.');
    }

    const items = await this.bankAccountRepo.findByCustomerId(input.customerId);
    return { items, total: items.length };
  }
}
