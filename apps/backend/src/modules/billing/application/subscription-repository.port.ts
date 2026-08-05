import type { EntityManager } from 'typeorm';
import type { Subscription } from '../domain/subscription';

export interface ISubscriptionRepository {
  findByOrganizationIdForUpdate(
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
