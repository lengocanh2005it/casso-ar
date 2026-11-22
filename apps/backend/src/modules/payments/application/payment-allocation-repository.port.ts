import type { EntityManager } from 'typeorm';
import type { PaymentAllocation } from '../domain/payment-allocation';

export interface IPaymentAllocationRepository {
  findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<PaymentAllocation | null>;
  save(allocation: PaymentAllocation, manager: EntityManager): Promise<void>;
  findByReceivableId(receivableId: string): Promise<PaymentAllocation[]>;
  findByCustomerId(
    customerId: string,
    limit: number,
  ): Promise<PaymentAllocation[]>;
  /**
   * One query for every customer, newest allocation first, at most
   * `limitPerCustomer` rows per customer. Customers without allocations are
   * absent from the map.
   */
  findByCustomerIds(
    customerIds: string[],
    limitPerCustomer: number,
  ): Promise<Map<string, PaymentAllocation[]>>;
}

export const PAYMENT_ALLOCATION_REPOSITORY = Symbol(
  'PAYMENT_ALLOCATION_REPOSITORY',
);
