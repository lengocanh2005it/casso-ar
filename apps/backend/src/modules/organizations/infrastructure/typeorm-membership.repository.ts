import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { IsNull, Not } from 'typeorm';
import { toLikePattern } from '../../../common/database/like-pattern';
import type {
  IMembershipRepository,
  MembershipListFilters,
} from '../application/membership-repository.port';
import { Membership, Role } from '../domain/membership';
import { MembershipOrmEntity } from './membership.orm-entity';

function toDomain(row: MembershipOrmEntity): Membership {
  return new Membership({
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    role: row.role,
    invitedAt: row.invitedAt,
    joinedAt: row.joinedAt,
    status: row.status,
    blockedAt: row.blockedAt,
    createdAt: row.createdAt,
  });
}

function toOrm(membership: Membership): MembershipOrmEntity {
  const row = new MembershipOrmEntity();
  row.id = membership.id;
  row.organizationId = membership.organizationId;
  row.userId = membership.userId;
  row.role = membership.role;
  row.invitedAt = membership.invitedAt;
  row.joinedAt = membership.joinedAt;
  row.status = membership.status;
  row.blockedAt = membership.blockedAt;
  row.createdAt = membership.createdAt;
  return row;
}

@Injectable()
export class TypeOrmMembershipRepository implements IMembershipRepository {
  constructor(
    @InjectRepository(MembershipOrmEntity)
    private readonly repo: Repository<MembershipOrmEntity>,
  ) {}

  async findByUserAndOrganization(
    userId: string,
    organizationId: string,
    manager?: EntityManager,
  ): Promise<Membership | null> {
    const repository = manager
      ? manager.getRepository(MembershipOrmEntity)
      : this.repo;
    const row = manager
      ? await repository
          .createQueryBuilder('membership')
          .setLock('pessimistic_write')
          .where('membership.userId = :userId', { userId })
          .andWhere('membership.organizationId = :organizationId', {
            organizationId,
          })
          .getOne()
      : await repository.findOne({ where: { userId, organizationId } });
    return row ? toDomain(row) : null;
  }

  async findFirstActiveByUserId(userId: string): Promise<Membership | null> {
    const row = await this.repo.findOne({
      where: { userId, joinedAt: Not(IsNull()) },
      order: { createdAt: 'ASC' },
    });
    return row ? toDomain(row) : null;
  }

  async findOwnerByOrganization(
    organizationId: string,
  ): Promise<Membership | null> {
    const row = await this.repo.findOne({
      where: { organizationId, role: Role.OWNER, joinedAt: Not(IsNull()) },
      order: { createdAt: 'ASC' },
    });
    return row ? toDomain(row) : null;
  }

  async findFirstByRole(
    organizationId: string,
    role: Role,
  ): Promise<Membership | null> {
    const row = await this.repo.findOne({
      where: { organizationId, role, joinedAt: Not(IsNull()) },
      order: { createdAt: 'ASC' },
    });
    return row ? toDomain(row) : null;
  }

  async save(membership: Membership, manager?: EntityManager): Promise<void> {
    await (manager
      ? manager.getRepository(MembershipOrmEntity)
      : this.repo
    ).save(toOrm(membership));
  }

  async findPageByOrganization(
    organizationId: string,
    page: number,
    limit: number,
    filters: MembershipListFilters = {},
  ): Promise<Membership[]> {
    const qb = this.applyListFilters(
      this.repo.createQueryBuilder('membership'),
      organizationId,
      filters,
    );
    const rows = await qb
      .select([
        'membership.id',
        'membership.organizationId',
        'membership.userId',
        'membership.role',
        'membership.invitedAt',
        'membership.joinedAt',
        'membership.status',
        'membership.blockedAt',
        'membership.createdAt',
      ])
      .orderBy('membership.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return rows.map(toDomain);
  }

  async countByOrganization(
    organizationId: string,
    filters: MembershipListFilters = {},
  ): Promise<number> {
    const qb = this.applyListFilters(
      this.repo.createQueryBuilder('membership'),
      organizationId,
      filters,
    );
    return qb.getCount();
  }

  async findUserIdsByOrganizationSearch(
    organizationId: string,
    search: string,
  ): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('membership')
      .innerJoin('users', 'user', 'user.id = membership.userId')
      .select('membership.userId', 'userId')
      .where('membership.organizationId = :organizationId', { organizationId })
      .andWhere('membership.joinedAt IS NOT NULL')
      .andWhere('(user.name ILIKE :pattern OR user.email ILIKE :pattern)', {
        pattern: toLikePattern(search.trim()),
      })
      .getRawMany();
    return rows.map((row) => row.userId);
  }

  private applyListFilters(
    qb: SelectQueryBuilder<MembershipOrmEntity>,
    organizationId: string,
    filters: MembershipListFilters,
  ): SelectQueryBuilder<MembershipOrmEntity> {
    qb.where('membership.organizationId = :organizationId', {
      organizationId,
    }).andWhere('membership.joinedAt IS NOT NULL');
    if (filters.status) {
      qb.andWhere('membership.status = :status', { status: filters.status });
    }
    if (filters.userIds) {
      if (filters.userIds.length === 0) {
        qb.andWhere('1 = 0');
      } else {
        qb.andWhere('membership.userId IN (:...userIds)', {
          userIds: filters.userIds,
        });
      }
    }
    return qb;
  }

  async countActiveByRole(
    organizationId: string,
    role: Role,
    manager?: EntityManager,
  ): Promise<number> {
    if (!manager) {
      return this.repo.count({
        where: { organizationId, role, joinedAt: Not(IsNull()) },
      });
    }
    // Row-locked within the caller's transaction so a concurrent last-owner
    // check on the same organization serializes instead of racing.
    const rows = await manager
      .getRepository(MembershipOrmEntity)
      .createQueryBuilder('membership')
      .setLock('pessimistic_write')
      .where('membership.organizationId = :organizationId', { organizationId })
      .andWhere('membership.role = :role', { role })
      .andWhere('membership.joinedAt IS NOT NULL')
      .getMany();
    return rows.length;
  }

  async deleteByUserAndOrganization(
    userId: string,
    organizationId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager?.getRepository(MembershipOrmEntity) ?? this.repo).delete({
      userId,
      organizationId,
    });
  }
}
