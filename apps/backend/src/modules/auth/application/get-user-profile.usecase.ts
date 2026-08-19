import type { Role } from '@casso-ledger/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from '../../bank-connections/application/bank-connection-repository.port';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../../billing/application/subscription-repository.port';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';

@Injectable()
export class GetUserProfileUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepo: ISubscriptionRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    private readonly tenantContext: TenantContextService,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
  ) {}

  async execute(userId: string): Promise<{
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    organizationId: string;
    organizationName: string;
    role: Role;
    subscriptionPlan: string;
    bankingLinked: boolean;
  }> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy người dùng.');
    }

    const organizationId = this.tenantContext.getOrganizationId();
    const [subscription, membership, organization, bankingLinked] =
      await Promise.all([
        this.subscriptionRepo.findByOrganizationId(organizationId),
        this.membershipRepo.findByUserAndOrganization(userId, organizationId),
        this.organizationRepo.findById(organizationId),
        this.bankConnectionRepo.hasActiveByOrganization(organizationId),
      ]);

    if (!membership?.isActive() || !organization) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'Người dùng không thuộc tổ chức hiện tại.',
      );
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      organizationId,
      organizationName: organization.name,
      role: membership.role,
      subscriptionPlan: subscription?.planId ?? 'FREE',
      bankingLinked,
    };
  }
}
