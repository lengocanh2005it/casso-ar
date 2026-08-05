import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { PasswordResetToken } from '../domain/password-reset-token';
import {
  AUTH_EMAIL_SENDER,
  type IAuthEmailSender,
} from './auth-email-sender.port';
import {
  type IPasswordResetTokenRepository,
  PASSWORD_RESET_TOKEN_REPOSITORY,
} from './password-reset-token-repository.port';
import { generateToken } from './token-hasher';

const RESET_TOKEN_TTL_MS = 45 * 60 * 1000;

@Injectable()
export class ForgotPasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly resetTokenRepo: IPasswordResetTokenRepository,
    @Inject(AUTH_EMAIL_SENDER) private readonly emailSender: IAuthEmailSender,
    private readonly dataSource: DataSource,
  ) {}

  async execute(inputEmail: string): Promise<void> {
    const user = await this.userRepo.findByEmail(
      inputEmail.trim().toLowerCase(),
    );
    if (!user) return;

    const { token, hash } = generateToken();
    await this.dataSource.transaction(async (manager) => {
      await this.resetTokenRepo.save(
        new PasswordResetToken({
          id: randomUUID(),
          userId: user.id,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
          usedAt: null,
          createdAt: new Date(),
        }),
        manager,
      );
    });

    await this.emailSender.sendPasswordResetEmail(
      user.email,
      `/auth/reset-password?token=${token}`,
    );
  }
}
