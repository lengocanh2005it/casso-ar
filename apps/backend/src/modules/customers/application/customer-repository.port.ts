import type { EntityManager } from 'typeorm';
import type { Customer } from '../domain/customer';

export interface ICustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findNameById(id: string): Promise<string | null>;
  save(customer: Customer, manager?: EntityManager): Promise<void>;
}

export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');
