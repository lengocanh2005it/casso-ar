import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
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
import {
  type IPendingSignupRepository,
  PENDING_SIGNUP_REPOSITORY,
} from './pending-signup-repository.port';
import { generateOtp } from './token-hasher';

const VERIFICATION_TOKEN_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class ResendVerificationEmailUseCase {
  private readonly logger = new Logger(ResendVerificationEmailUseCase.name);

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
      pendingSignup.withNewOtp(
        hash,
        new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
      ),
    );
    this.logger.log({
      message: 'Verification OTP resent',
      email: pendingSignup.email,
    });
    await this.emailSender.sendVerificationEmail(pendingSignup.email, otp);
  }
}
