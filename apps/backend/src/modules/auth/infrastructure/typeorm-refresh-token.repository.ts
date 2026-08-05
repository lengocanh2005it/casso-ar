import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { IsNull } from 'typeorm';
import type { IRefreshTokenRepository } from '../application/refresh-token-repository.port';
import { RefreshToken } from '../domain/refresh-token';
import { RefreshTokenOrmEntity } from './refresh-token.orm-entity';

@Injectable()
export class TypeOrmRefreshTokenRepository implements IRefreshTokenRepository {
  constructor(
    @InjectRepository(RefreshTokenOrmEntity)
    private readonly repo: Repository<RefreshTokenOrmEntity>,
  ) {}

  async findByTokenHash(
    tokenHash: string,
    manager?: EntityManager,
  ): Promise<RefreshToken | null> {
    const row = await (manager
      ? manager.getRepository(RefreshTokenOrmEntity)
      : this.repo
    ).findOne({ where: { tokenHash } });
    return row ? new RefreshToken(row) : null;
  }

  async save(token: RefreshToken, manager?: EntityManager): Promise<void> {
    await (manager
      ? manager.getRepository(RefreshTokenOrmEntity)
      : this.repo
    ).save(token);
  }

  async revokeAllForUser(
    userId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager
      ? manager.getRepository(RefreshTokenOrmEntity)
      : this.repo
    ).update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }
}
