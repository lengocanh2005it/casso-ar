import type { EntityManager } from 'typeorm';
import type { CasIdConnectionSession } from '../domain/cas-id-connection-session';

export interface ICasIdConnectionSessionRepository {
  findById(id: string): Promise<CasIdConnectionSession | null>;
  findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<CasIdConnectionSession | null>;
  save(session: CasIdConnectionSession, manager?: EntityManager): Promise<void>;
}

export const CAS_ID_CONNECTION_SESSION_REPOSITORY = Symbol(
  'CAS_ID_CONNECTION_SESSION_REPOSITORY',
);
