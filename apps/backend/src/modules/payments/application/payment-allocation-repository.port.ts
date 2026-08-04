import type { EntityManager } from 'typeorm';
import type { PaymentAllocation } from '../domain/payment-allocation';

export interface IPaymentAllocationRepository {
  findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<PaymentAllocation | null>;
  create(allocation: PaymentAllocation, manager: EntityManager): Promise<void>;
  save(allocation: PaymentAllocation, manager: EntityManager): Promise<void>;
}

export const PAYMENT_ALLOCATION_REPOSITORY = Symbol(
  'PAYMENT_ALLOCATION_REPOSITORY',
);
