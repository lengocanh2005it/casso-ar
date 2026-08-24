import type { EntityManager } from 'typeorm';
import type { PendingSignup } from '../domain/pending-signup';

export interface IPendingSignupRepository {
  findByEmail(
    email: string,
    manager?: EntityManager,
  ): Promise<PendingSignup | null>;
  findByTaxCode(
    taxCode: string,
    manager?: EntityManager,
  ): Promise<PendingSignup | null>;
  save(pendingSignup: PendingSignup, manager?: EntityManager): Promise<void>;
  delete(id: string, manager?: EntityManager): Promise<void>;
}

export const PENDING_SIGNUP_REPOSITORY = Symbol('PENDING_SIGNUP_REPOSITORY');
