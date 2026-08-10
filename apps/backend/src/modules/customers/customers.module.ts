import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CUSTOMER_REPOSITORY } from './application/customer-repository.port';
import { GetCustomerUseCase } from './application/get-customer.usecase';
import { ListCustomersUseCase } from './application/list-customers.usecase';
import { CustomerOrmEntity } from './infrastructure/customer.orm-entity';
import { TypeOrmCustomerRepository } from './infrastructure/typeorm-customer.repository';
import { CustomersController } from './presentation/customers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerOrmEntity])],
  controllers: [CustomersController],
  providers: [
    { provide: CUSTOMER_REPOSITORY, useClass: TypeOrmCustomerRepository },
    GetCustomerUseCase,
    ListCustomersUseCase,
  ],
  exports: [CUSTOMER_REPOSITORY],
})
export class CustomersModule {}
