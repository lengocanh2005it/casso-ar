import type { EntityManager } from 'typeorm';
import type { PaymentAllocation } from '../domain/payment-allocation';

export interface IPaymentAllocationRepository {
  findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<PaymentAllocation | null>;
  save(allocation: PaymentAllocation, manager: EntityManager): Promise<void>;
  findByReceivableId(receivableId: string): Promise<PaymentAllocation[]>;
}

export const PAYMENT_ALLOCATION_REPOSITORY = Symbol(
  'PAYMENT_ALLOCATION_REPOSITORY',
);
