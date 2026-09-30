import type { EntityManager } from 'typeorm';
import type { Customer } from '../domain/customer';

export interface ICustomerRepository {
  findById(id: string, manager?: EntityManager): Promise<Customer | null>;
  findByIdForSalesRep(
    id: string,
    salesRepresentativeId: string,
  ): Promise<Customer | null>;
  findByIds(ids: string[]): Promise<Map<string, Customer>>;
  findByTaxCode(
    taxCode: string,
    manager?: EntityManager,
  ): Promise<Customer | null>;
  findByEmail(email: string, manager?: EntityManager): Promise<Customer | null>;
  findNameById(id: string): Promise<string | null>;
  findIdsBySearch(organizationId: string, search: string): Promise<string[]>;
  findPage(
    organizationId: string,
    search: string | undefined,
    page: number,
    limit: number,
    salesRepresentativeId?: string,
  ): Promise<Customer[]>;
  count(
    organizationId: string,
    search: string | undefined,
    salesRepresentativeId?: string,
  ): Promise<number>;
  save(customer: Customer, manager?: EntityManager): Promise<void>;
}

export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');
