import type { EntityManager } from 'typeorm';
import type { Subscription } from '../domain/subscription';

export interface ISubscriptionRepository {
  // Serializes concurrent transactions for the same org, including the case
  // where no Subscription row exists yet to lock — a plain SELECT ... FOR
  // UPDATE can't help there, since it can only lock a row that already exists.
  acquireOrganizationLock(
    organizationId: string,
    manager: EntityManager,
  ): Promise<void>;
  findByOrganizationId(
    organizationId: string,
    manager: EntityManager,
  ): Promise<Subscription | null>;
  countReceivablesInPeriod(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
    manager: EntityManager,
  ): Promise<number>;
  save(subscription: Subscription, manager?: EntityManager): Promise<void>;
}

export const SUBSCRIPTION_REPOSITORY = Symbol('SUBSCRIPTION_REPOSITORY');
