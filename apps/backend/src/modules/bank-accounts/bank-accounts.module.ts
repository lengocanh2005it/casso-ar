import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomersModule } from '../customers/customers.module';
import { CreateCustomerBankAccountUseCase } from './application/create-customer-bank-account.usecase';
import { CUSTOMER_BANK_ACCOUNT_REPOSITORY } from './application/customer-bank-account-repository.port';
import { DeactivateCustomerBankAccountUseCase } from './application/deactivate-customer-bank-account.usecase';
import { ListCustomerBankAccountsUseCase } from './application/list-customer-bank-accounts.usecase';
import { UpdateCustomerBankAccountUseCase } from './application/update-customer-bank-account.usecase';
import { CustomerBankAccountOrmEntity } from './infrastructure/customer-bank-account.orm-entity';
import { TypeOrmCustomerBankAccountRepository } from './infrastructure/typeorm-customer-bank-account.repository';
import { CustomerBankAccountsController } from './presentation/customer-bank-accounts.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CustomerBankAccountOrmEntity]),
    CustomersModule,
  ],
  providers: [
    {
      provide: CUSTOMER_BANK_ACCOUNT_REPOSITORY,
      useClass: TypeOrmCustomerBankAccountRepository,
    },
    ListCustomerBankAccountsUseCase,
    CreateCustomerBankAccountUseCase,
    UpdateCustomerBankAccountUseCase,
    DeactivateCustomerBankAccountUseCase,
  ],
  controllers: [CustomerBankAccountsController],
  exports: [CUSTOMER_BANK_ACCOUNT_REPOSITORY],
})
export class BankAccountsModule {}
