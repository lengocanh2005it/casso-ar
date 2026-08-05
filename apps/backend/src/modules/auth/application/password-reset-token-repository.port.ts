import type { EntityManager } from 'typeorm';
import type { PasswordResetToken } from '../domain/password-reset-token';

export interface IPasswordResetTokenRepository {
  findByTokenHash(
    tokenHash: string,
    manager?: EntityManager,
  ): Promise<PasswordResetToken | null>;
  save(token: PasswordResetToken, manager?: EntityManager): Promise<void>;
}

export const PASSWORD_RESET_TOKEN_REPOSITORY = Symbol(
  'PASSWORD_RESET_TOKEN_REPOSITORY',
);
