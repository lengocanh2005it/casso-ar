import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { EmailVerificationToken } from '../domain/email-verification-token';
import { PendingSignup } from '../domain/pending-signup';
import {
  AUTH_EMAIL_SENDER,
  type IAuthEmailSender,
} from './auth-email-sender.port';
import {
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  type IEmailVerificationTokenRepository,
} from './email-verification-token-repository.port';
import {
  PENDING_SIGNUP_REPOSITORY,
  type IPendingSignupRepository,
} from './pending-signup-repository.port';
import { generateOtp } from './token-hasher';

const VERIFICATION_TOKEN_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class ResendVerificationEmailUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokenRepo: IEmailVerificationTokenRepository,
    @Inject(PENDING_SIGNUP_REPOSITORY)
    private readonly pendingSignupRepo: IPendingSignupRepository,
    @Inject(AUTH_EMAIL_SENDER) private readonly emailSender: IAuthEmailSender,
    private readonly dataSource: DataSource,
  ) {}

  async execute(inputEmail: string): Promise<void> {
    const email = inputEmail.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(email);
    if (user && !user.isEmailVerified()) {
      const { otp, hash } = generateOtp();
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
      await this.emailSender.sendVerificationEmail(user.email, otp);
      return;
    }
    if (user) return;

    const pendingSignup = await this.pendingSignupRepo.findByEmail(email);
    if (!pendingSignup) return;

    const { otp, hash } = generateOtp();
    await this.pendingSignupRepo.save(
      new PendingSignup({
        ...pendingSignup,
        otpHash: hash,
        expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
      }),
    );
    await this.emailSender.sendVerificationEmail(pendingSignup.email, otp);
  }
}
