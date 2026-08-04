import type { EntityManager } from 'typeorm';
import type { Payment } from '../domain/payment';

export interface IPaymentRepository {
  findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<Payment | null>;
  save(payment: Payment, manager?: EntityManager): Promise<void>;
}

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');
