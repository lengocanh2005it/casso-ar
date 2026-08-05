import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { IsNull, Not } from 'typeorm';
import type { IMembershipRepository } from '../application/membership-repository.port';
import { Membership } from '../domain/membership';
import { MembershipOrmEntity } from './membership.orm-entity';

@Injectable()
export class TypeOrmMembershipRepository implements IMembershipRepository {
  constructor(
    @InjectRepository(MembershipOrmEntity)
    private readonly repo: Repository<MembershipOrmEntity>,
  ) {}

  async findByUserAndOrganization(
    userId: string,
    organizationId: string,
  ): Promise<Membership | null> {
    const row = await this.repo.findOne({ where: { userId, organizationId } });
    return row ? new Membership(row) : null;
  }

  async findFirstActiveByUserId(userId: string): Promise<Membership | null> {
    const row = await this.repo.findOne({
      where: { userId, joinedAt: Not(IsNull()) },
      order: { createdAt: 'ASC' },
    });
    return row ? new Membership(row) : null;
  }

  async save(membership: Membership, manager?: EntityManager): Promise<void> {
    await (manager
      ? manager.getRepository(MembershipOrmEntity)
      : this.repo
    ).save(membership);
  }
}
