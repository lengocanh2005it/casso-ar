import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { IsNull } from 'typeorm';
import type { IRefreshTokenRepository } from '../application/refresh-token-repository.port';
import { RefreshToken } from '../domain/refresh-token';
import { RefreshTokenOrmEntity } from './refresh-token.orm-entity';

function toDomain(row: RefreshTokenOrmEntity): RefreshToken {
  return new RefreshToken({
    id: row.id,
    userId: row.userId,
    sessionId: row.sessionId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    replacedByTokenId: row.replacedByTokenId,
    createdAt: row.createdAt,
  });
}

// Explicit field-by-field mapping: a new column on either side fails the
// compiler here instead of silently riding along.
function toOrm(token: RefreshToken): RefreshTokenOrmEntity {
  const row = new RefreshTokenOrmEntity();
  row.id = token.id;
  row.userId = token.userId;
  row.sessionId = token.sessionId;
  row.tokenHash = token.tokenHash;
  row.expiresAt = token.expiresAt;
  row.revokedAt = token.revokedAt;
  row.replacedByTokenId = token.replacedByTokenId;
  row.createdAt = token.createdAt;
  return row;
}

@Injectable()
export class TypeOrmRefreshTokenRepository implements IRefreshTokenRepository {
  constructor(
    @InjectRepository(RefreshTokenOrmEntity)
    private readonly repo: Repository<RefreshTokenOrmEntity>,
  ) {}

  private repoFor(manager?: EntityManager): Repository<RefreshTokenOrmEntity> {
    return manager ? manager.getRepository(RefreshTokenOrmEntity) : this.repo;
  }

  async findByTokenHash(
    tokenHash: string,
    manager?: EntityManager,
    lockForUpdate = false,
  ): Promise<RefreshToken | null> {
    const row = await this.repoFor(manager).findOne({
      where: { tokenHash },
      ...(lockForUpdate
        ? { lock: { mode: 'pessimistic_write' as const } }
        : {}),
    });
    return row ? toDomain(row) : null;
  }

  async findById(
    id: string,
    manager?: EntityManager,
    lockForShare = false,
  ): Promise<RefreshToken | null> {
    const row = await this.repoFor(manager).findOne({
      where: { id },
      ...(lockForShare ? { lock: { mode: 'pessimistic_read' as const } } : {}),
    });
    return row ? toDomain(row) : null;
  }

  async save(token: RefreshToken, manager?: EntityManager): Promise<void> {
    await this.repoFor(manager).save(toOrm(token));
  }

  async revokeAllForUser(
    userId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.repoFor(manager).update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async revokeSession(
    sessionId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.repoFor(manager).update(
      { sessionId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
