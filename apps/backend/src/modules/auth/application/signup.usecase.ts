import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI resolves this constructor parameter at runtime.
import { DataSource } from 'typeorm';
import { AuthError } from '../../../common/errors/auth.error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../../billing/application/subscription-repository.port';
import { Subscription } from '../../billing/domain/subscription';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import { Membership, Role } from '../../organizations/domain/membership';
import { Organization } from '../../organizations/domain/organization';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { User } from '../../users/domain/user';
import { EmailVerificationToken } from '../domain/email-verification-token';
import {
  AUTH_EMAIL_SENDER,
  type IAuthEmailSender,
} from './auth-email-sender.port';
import {
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  type IEmailVerificationTokenRepository,
} from './email-verification-token-repository.port';
// biome-ignore lint/style/useImportType: NestJS DI resolves this constructor parameter at runtime.
import { LoginUseCase } from './login.usecase';
import {
  DEFAULT_ORGANIZATION_BOOTSTRAP,
  type IOrganizationBootstrap,
} from './organization-bootstrap.port';
import { hashPassword } from './password-hasher';
import { generateToken } from './token-hasher';

export interface SignupInput {
  organizationName: string;
  name: string;
  email: string;
  password: string;
}

export interface SignupResult {
  user: User;
  organization: Organization;
  membership: Membership;
  accessToken: string;
  refreshToken: string;
}

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SignupUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokenRepo: IEmailVerificationTokenRepository,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepo: ISubscriptionRepository,
    @Inject(DEFAULT_ORGANIZATION_BOOTSTRAP)
    private readonly organizationBootstrap: IOrganizationBootstrap,
    @Inject(AUTH_EMAIL_SENDER)
    private readonly emailSender: IAuthEmailSender,
    private readonly loginUseCase: LoginUseCase,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: SignupInput): Promise<SignupResult> {
    const email = input.email.trim().toLowerCase();
    if (await this.userRepo.findByEmail(email)) {
      throw new AuthError(409, ErrorCode.CONFLICT, 'Email đã được đăng ký.');
    }

    const now = new Date();
    const user = new User({
      id: randomUUID(),
      name: input.name.trim(),
      email,
      passwordHash: await hashPassword(input.password),
      emailVerifiedAt: null,
      createdAt: now,
    });
    const organization = new Organization({
      id: randomUUID(),
      name: input.organizationName.trim(),
      createdAt: now,
    });
    const membership = new Membership({
      id: randomUUID(),
      organizationId: organization.id,
      userId: user.id,
      role: Role.OWNER,
      invitedAt: now,
      joinedAt: now,
      createdAt: now,
    });

    await this.dataSource.transaction(async (manager) => {
      await this.organizationRepo.save(organization, manager);
      await this.userRepo.save(user, manager);
      await this.membershipRepo.save(membership, manager);
      await this.subscriptionRepo.save(
        Subscription.createFree(randomUUID(), organization.id, now),
        manager,
        organization.id,
      );
      await this.organizationBootstrap.seed(organization.id, manager);
    });

    const { token, hash } = generateToken();
    await this.verificationTokenRepo.save(
      new EmailVerificationToken({
        id: randomUUID(),
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS),
        createdAt: now,
      }),
    );
    await this.emailSender.sendVerificationEmail(
      user.email,
      `/auth/verify-email?token=${token}`,
    );

    const tokens = await this.loginUseCase.execute({
      email: user.email,
      password: input.password,
    });
    return { user, organization, membership, ...tokens };
  }
}
