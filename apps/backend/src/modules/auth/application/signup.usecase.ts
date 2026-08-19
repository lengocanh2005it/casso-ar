import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
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
import { matchesTaxCodeName } from '../../organizations/domain/normalize-company-name';
import { Organization } from '../../organizations/domain/organization';
import {
  type ITaxCodeLookupAdapter,
  TAX_CODE_LOOKUP_ADAPTER,
} from '../../tax-verification/application/tax-code-lookup.port';
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
import { LoginUseCase } from './login.usecase';
import {
  type IMemberNotificationSender,
  MEMBER_NOTIFICATION_SENDER,
} from './member-notification.port';
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
  taxCode: string;
}

export interface SignupResult {
  user: User;
  organization: Organization;
  membership: Membership;
  accessToken?: string;
  refreshToken?: string;
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
    @Inject(TAX_CODE_LOOKUP_ADAPTER)
    private readonly taxCodeLookup: ITaxCodeLookupAdapter,
    @Inject(MEMBER_NOTIFICATION_SENDER)
    private readonly memberNotificationSender: IMemberNotificationSender,
    private readonly loginUseCase: LoginUseCase,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: SignupInput): Promise<SignupResult> {
    const email = input.email.trim().toLowerCase();
    if (await this.userRepo.findByEmail(email)) {
      throw new AppError(ErrorCode.CONFLICT, 'Email đã được đăng ký.');
    }

    const organizationName = input.organizationName.trim();
    const lookupResult = await this.taxCodeLookup.lookup(input.taxCode);
    const taxCodeMatched =
      lookupResult !== null &&
      matchesTaxCodeName(organizationName, lookupResult.name);

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
      name: organizationName,
      status: taxCodeMatched ? 'ACTIVE' : 'PENDING_REVIEW',
      taxCode: input.taxCode,
      taxCodeMatched,
      taxCodeLookupName: lookupResult?.name ?? null,
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
      `/verify-email?token=${token}`,
    );

    if (organization.status !== 'ACTIVE') {
      return { user, organization, membership };
    }

    await this.memberNotificationSender.sendOrganizationApprovedEmail(
      user.email,
      organization.name,
    );
    const tokens = await this.loginUseCase.execute({
      email: user.email,
      password: input.password,
    });
    return { user, organization, membership, ...tokens };
  }
}
