import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CUSTOMER_BANK_ACCOUNT_REPOSITORY } from './application/customer-bank-account-repository.port';
import { CustomerBankAccountOrmEntity } from './infrastructure/customer-bank-account.orm-entity';
import { TypeOrmCustomerBankAccountRepository } from './infrastructure/typeorm-customer-bank-account.repository';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerBankAccountOrmEntity])],
  providers: [
    {
      provide: CUSTOMER_BANK_ACCOUNT_REPOSITORY,
      useClass: TypeOrmCustomerBankAccountRepository,
    },
  ],
  exports: [CUSTOMER_BANK_ACCOUNT_REPOSITORY],
})
export class BankAccountsModule {}
