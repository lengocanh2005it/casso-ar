import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { IMembershipInviteRepository } from '../application/membership-invite-repository.port';
import { MembershipInvite } from '../domain/membership-invite';
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

  async save(invite: MembershipInvite, manager?: EntityManager): Promise<void> {
    await (manager
      ? manager.getRepository(MembershipInviteOrmEntity)
      : this.repo
    ).save(invite);
  }
}
