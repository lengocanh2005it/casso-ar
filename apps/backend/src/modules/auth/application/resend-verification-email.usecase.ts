import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { buildFrontendUrl } from '../../../common/config/frontend-url';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { EmailVerificationToken } from '../domain/email-verification-token';
import {
  AUTH_EMAIL_SENDER,
  type IAuthEmailSender,
} from './auth-email-sender.port';
import {
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  type IEmailVerificationTokenRepository,
} from './email-verification-token-repository.port';
import { generateToken } from './token-hasher';

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ResendVerificationEmailUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokenRepo: IEmailVerificationTokenRepository,
    @Inject(AUTH_EMAIL_SENDER) private readonly emailSender: IAuthEmailSender,
    private readonly dataSource: DataSource,
  ) {}

  async execute(inputEmail: string): Promise<void> {
    const user = await this.userRepo.findByEmail(
      inputEmail.trim().toLowerCase(),
    );
    if (!user || user.isEmailVerified()) return;

    const { token, hash } = generateToken();
    await this.dataSource.transaction(async (manager) => {
      await this.verificationTokenRepo.deleteByUserId(user.id, manager);
      await this.verificationTokenRepo.save(
        new EmailVerificationToken({
          id: randomUUID(),
          userId: user.id,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
          createdAt: new Date(),
        }),
        manager,
      );
    });

    await this.emailSender.sendVerificationEmail(
      user.email,
      buildFrontendUrl(`/verify-email?token=${token}`),
    );
  }
}
