import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
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
import {
  DEFAULT_ORGANIZATION_BOOTSTRAP,
  type IOrganizationBootstrap,
} from './organization-bootstrap.port';

export interface ProvisionOrganizationInput {
  name: string;
  email: string;
  passwordHash: string;
  organizationName: string;
  taxCode: string;
  taxCodeMatched: boolean;
  taxCodeLookupName: string | null;
}

export interface ProvisionOrganizationResult {
  user: User;
  organization: Organization;
  membership: Membership;
}

@Injectable()
export class ProvisionOrganizationUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepo: ISubscriptionRepository,
    @Inject(DEFAULT_ORGANIZATION_BOOTSTRAP)
    private readonly organizationBootstrap: IOrganizationBootstrap,
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    input: ProvisionOrganizationInput,
    manager?: EntityManager,
  ): Promise<ProvisionOrganizationResult> {
    const now = new Date();
    const user = new User({
      id: randomUUID(),
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      emailVerifiedAt: null,
      createdAt: now,
    });
    const organization = new Organization({
      id: randomUUID(),
      name: input.organizationName,
      status: 'PENDING_REVIEW',
      taxCode: input.taxCode,
      taxCodeMatched: input.taxCodeMatched,
      taxCodeLookupName: input.taxCodeLookupName,
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

    const run = async (activeManager: EntityManager) => {
      await this.organizationRepo.save(organization, activeManager);
      await this.userRepo.save(user, activeManager);
      await this.membershipRepo.save(membership, activeManager);
      await this.subscriptionRepo.save(
        Subscription.createFree(randomUUID(), organization.id, now),
        activeManager,
        organization.id,
      );
      await this.organizationBootstrap.seed(organization.id, activeManager);
    };

    if (manager) {
      await run(manager);
    } else {
      await this.dataSource.transaction(run);
    }

    return { user, organization, membership };
  }
}
