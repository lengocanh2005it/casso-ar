import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { IsNull } from 'typeorm';
import type { IMembershipInviteRepository } from '../application/membership-invite-repository.port';
import {
  MembershipInvite,
  type PendingInviteSummary,
} from '../domain/membership-invite';
import { MembershipInviteOrmEntity } from './membership-invite.orm-entity';

@Injectable()
export class TypeOrmMembershipInviteRepository
  implements IMembershipInviteRepository
{
  constructor(
    @InjectRepository(MembershipInviteOrmEntity)
    private readonly repo: Repository<MembershipInviteOrmEntity>,
  ) {}

  async findByTokenHash(tokenHash: string): Promise<MembershipInvite | null> {
    const row = await this.repo.findOne({ where: { tokenHash } });
    return row ? new MembershipInvite(row) : null;
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<MembershipInvite | null> {
    const row = await this.repo.findOne({ where: { id, organizationId } });
    return row ? new MembershipInvite(row) : null;
  }

  async save(invite: MembershipInvite, manager?: EntityManager): Promise<void> {
    await (manager
      ? manager.getRepository(MembershipInviteOrmEntity)
      : this.repo
    ).save(invite);
  }

  async delete(
    id: string,
    organizationId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager
      ? manager.getRepository(MembershipInviteOrmEntity)
      : this.repo
    ).delete({ id, organizationId });
  }

  async findPendingPageByOrganization(
    organizationId: string,
    page: number,
    limit: number,
  ): Promise<PendingInviteSummary[]> {
    const rows = await this.repo.find({
      where: { organizationId, acceptedAt: IsNull() },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        expiresAt: true,
      },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    }));
  }

  async countPendingByOrganization(organizationId: string): Promise<number> {
    return this.repo.count({ where: { organizationId, acceptedAt: IsNull() } });
  }
}
