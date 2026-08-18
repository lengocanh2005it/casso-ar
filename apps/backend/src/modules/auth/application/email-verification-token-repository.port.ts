import type { EntityManager } from 'typeorm';
import type { EmailVerificationToken } from '../domain/email-verification-token';

export interface IEmailVerificationTokenRepository {
  findByTokenHash(
    tokenHash: string,
    manager?: EntityManager,
  ): Promise<EmailVerificationToken | null>;
  save(token: EmailVerificationToken, manager?: EntityManager): Promise<void>;
  deleteByUserId(userId: string, manager?: EntityManager): Promise<void>;
  deleteById(id: string, manager?: EntityManager): Promise<void>;
}

export const EMAIL_VERIFICATION_TOKEN_REPOSITORY = Symbol(
  'EMAIL_VERIFICATION_TOKEN_REPOSITORY',
);
