import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MEMBERSHIP_REPOSITORY } from './application/membership-repository.port';
import { MembershipOrmEntity } from './infrastructure/membership.orm-entity';
import { TypeOrmMembershipRepository } from './infrastructure/typeorm-membership.repository';

@Module({
  imports: [TypeOrmModule.forFeature([MembershipOrmEntity])],
  providers: [
    { provide: MEMBERSHIP_REPOSITORY, useClass: TypeOrmMembershipRepository },
  ],
  exports: [MEMBERSHIP_REPOSITORY],
})
export class OrganizationsModule {}
