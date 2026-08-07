import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserOrmEntity } from '../users/infrastructure/user.orm-entity';
import { MEMBERSHIP_REPOSITORY } from './application/membership-repository.port';
import { ORGANIZATION_REPOSITORY } from './application/organization-repository.port';
import { MembershipOrmEntity } from './infrastructure/membership.orm-entity';
import { OrganizationOrmEntity } from './infrastructure/organization.orm-entity';
import { TypeOrmMembershipRepository } from './infrastructure/typeorm-membership.repository';
import { TypeOrmOrganizationRepository } from './infrastructure/typeorm-organization.repository';
import { ListMembersUseCase } from './presentation/list-members.usecase';
import { OrganizationsController } from './presentation/organizations.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MembershipOrmEntity,
      OrganizationOrmEntity,
      UserOrmEntity,
    ]),
  ],
  controllers: [OrganizationsController],
  providers: [
    { provide: MEMBERSHIP_REPOSITORY, useClass: TypeOrmMembershipRepository },
    {
      provide: ORGANIZATION_REPOSITORY,
      useClass: TypeOrmOrganizationRepository,
    },
    ListMembersUseCase,
  ],
  exports: [MEMBERSHIP_REPOSITORY, ORGANIZATION_REPOSITORY],
})
export class OrganizationsModule {}
