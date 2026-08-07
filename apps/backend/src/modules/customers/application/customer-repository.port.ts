import type { EntityManager } from 'typeorm';
import type { Customer } from '../domain/customer';

export interface ICustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findNameById(id: string): Promise<string | null>;
  findPage(
    organizationId: string,
    search: string | undefined,
    page: number,
    limit: number,
  ): Promise<Customer[]>;
  count(organizationId: string, search: string | undefined): Promise<number>;
  save(customer: Customer, manager?: EntityManager): Promise<void>;
}

export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');
