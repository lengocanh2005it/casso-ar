import type { EntityManager } from 'typeorm';
import type { Subscription } from '../domain/subscription';

export interface ISubscriptionRepository {
  // Acquires a pg_advisory_xact_lock keyed by organizationId, then reads the
  // row — serializes concurrent transactions for the same org even when no
  // Subscription row exists yet, where a plain SELECT ... FOR UPDATE can't
  // help (it can only lock a row that already exists).
  lockAndFindByOrganizationId(
    organizationId: string,
    manager: EntityManager,
  ): Promise<Subscription | null>;
  countReceivablesInPeriod(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
    manager: EntityManager,
  ): Promise<number>;
  save(
    subscription: Subscription,
    manager?: EntityManager,
    organizationId?: string,
  ): Promise<void>;
}

export const SUBSCRIPTION_REPOSITORY = Symbol('SUBSCRIPTION_REPOSITORY');
