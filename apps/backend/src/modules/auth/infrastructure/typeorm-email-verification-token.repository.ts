import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { IEmailVerificationTokenRepository } from '../application/email-verification-token-repository.port';
import { EmailVerificationToken } from '../domain/email-verification-token';
import { EmailVerificationTokenOrmEntity } from './email-verification-token.orm-entity';

@Injectable()
export class TypeOrmEmailVerificationTokenRepository
  implements IEmailVerificationTokenRepository
{
  constructor(
    @InjectRepository(EmailVerificationTokenOrmEntity)
    private readonly repo: Repository<EmailVerificationTokenOrmEntity>,
  ) {}

  async findByTokenHash(
    tokenHash: string,
    manager?: EntityManager,
  ): Promise<EmailVerificationToken | null> {
    const row = await (manager
      ? manager.getRepository(EmailVerificationTokenOrmEntity)
      : this.repo
    ).findOne({ where: { tokenHash } });
    return row ? new EmailVerificationToken(row) : null;
  }

  async save(
    token: EmailVerificationToken,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager
      ? manager.getRepository(EmailVerificationTokenOrmEntity)
      : this.repo
    ).save(token);
  }

  async deleteById(id: string, manager?: EntityManager): Promise<void> {
    await (manager
      ? manager.getRepository(EmailVerificationTokenOrmEntity)
      : this.repo
    ).delete({ id });
  }
}
