import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MEMBERSHIP_REPOSITORY } from './application/membership-repository.port';
import { ORGANIZATION_REPOSITORY } from './application/organization-repository.port';
import { MembershipOrmEntity } from './infrastructure/membership.orm-entity';
import { OrganizationOrmEntity } from './infrastructure/organization.orm-entity';
import { TypeOrmMembershipRepository } from './infrastructure/typeorm-membership.repository';
import { TypeOrmOrganizationRepository } from './infrastructure/typeorm-organization.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrganizationOrmEntity, MembershipOrmEntity]),
  ],
  providers: [
    {
      provide: ORGANIZATION_REPOSITORY,
      useClass: TypeOrmOrganizationRepository,
    },
    { provide: MEMBERSHIP_REPOSITORY, useClass: TypeOrmMembershipRepository },
  ],
  exports: [ORGANIZATION_REPOSITORY, MEMBERSHIP_REPOSITORY],
})
export class OrganizationsModule {}
