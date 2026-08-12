import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { ChangeMemberRoleUseCase } from './application/change-member-role.usecase';
import { ListMembersUseCase } from './application/list-members.usecase';
import { MEMBERSHIP_REPOSITORY } from './application/membership-repository.port';
import { ORGANIZATION_REPOSITORY } from './application/organization-repository.port';
import { MembershipOrmEntity } from './infrastructure/membership.orm-entity';
import { OrganizationOrmEntity } from './infrastructure/organization.orm-entity';
import { TypeOrmMembershipRepository } from './infrastructure/typeorm-membership.repository';
import { TypeOrmOrganizationRepository } from './infrastructure/typeorm-organization.repository';
import { OrganizationsController } from './presentation/organizations.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MembershipOrmEntity, OrganizationOrmEntity]),
    UsersModule,
  ],
  controllers: [OrganizationsController],
  providers: [
    { provide: MEMBERSHIP_REPOSITORY, useClass: TypeOrmMembershipRepository },
    {
      provide: ORGANIZATION_REPOSITORY,
      useClass: TypeOrmOrganizationRepository,
    },
    ListMembersUseCase,
    ChangeMemberRoleUseCase,
  ],
  exports: [MEMBERSHIP_REPOSITORY, ORGANIZATION_REPOSITORY],
})
export class OrganizationsModule {}
