import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { IPasswordResetTokenRepository } from '../application/password-reset-token-repository.port';
import { PasswordResetToken } from '../domain/password-reset-token';
import { PasswordResetTokenOrmEntity } from './password-reset-token.orm-entity';

@Injectable()
export class TypeOrmPasswordResetTokenRepository
  implements IPasswordResetTokenRepository
{
  constructor(
    @InjectRepository(PasswordResetTokenOrmEntity)
    private readonly repo: Repository<PasswordResetTokenOrmEntity>,
  ) {}

  async findByTokenHash(
    tokenHash: string,
    manager?: EntityManager,
  ): Promise<PasswordResetToken | null> {
    const row = await (manager
      ? manager.getRepository(PasswordResetTokenOrmEntity)
      : this.repo
    ).findOne({ where: { tokenHash } });
    return row ? new PasswordResetToken(row) : null;
  }

  async save(
    token: PasswordResetToken,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager
      ? manager.getRepository(PasswordResetTokenOrmEntity)
      : this.repo
    ).save(token);
  }
}
