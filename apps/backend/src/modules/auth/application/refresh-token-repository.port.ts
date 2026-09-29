import type { EntityManager } from 'typeorm';
import type { RefreshToken } from '../domain/refresh-token';

export interface IRefreshTokenRepository {
  findByTokenHash(
    tokenHash: string,
    manager?: EntityManager,
    lockForUpdate?: boolean,
  ): Promise<RefreshToken | null>;
  findById(id: string, manager?: EntityManager): Promise<RefreshToken | null>;
  save(token: RefreshToken, manager?: EntityManager): Promise<void>;
  revokeAllForUser(userId: string, manager?: EntityManager): Promise<void>;
}

export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');
