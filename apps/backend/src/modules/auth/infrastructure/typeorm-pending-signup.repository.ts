import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import type { IPendingSignupRepository } from '../application/pending-signup-repository.port';
import { PendingSignup } from '../domain/pending-signup';
import { PendingSignupOrmEntity } from './pending-signup.orm-entity';

function toDomain(row: PendingSignupOrmEntity): PendingSignup {
  return new PendingSignup({
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    name: row.name,
    organizationName: row.organizationName,
    taxCode: row.taxCode,
    taxCodeMatched: row.taxCodeMatched,
    taxCodeLookupName: row.taxCodeLookupName,
    otpHash: row.otpHash,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  });
}

function toOrm(pendingSignup: PendingSignup): PendingSignupOrmEntity {
  const row = new PendingSignupOrmEntity();
  row.id = pendingSignup.id;
  row.email = pendingSignup.email;
  row.passwordHash = pendingSignup.passwordHash;
  row.name = pendingSignup.name;
  row.organizationName = pendingSignup.organizationName;
  row.taxCode = pendingSignup.taxCode;
  row.taxCodeMatched = pendingSignup.taxCodeMatched;
  row.taxCodeLookupName = pendingSignup.taxCodeLookupName;
  row.otpHash = pendingSignup.otpHash;
  row.expiresAt = pendingSignup.expiresAt;
  row.createdAt = pendingSignup.createdAt;
  return row;
}

@Injectable()
export class TypeOrmPendingSignupRepository
  implements IPendingSignupRepository
{
  constructor(private readonly dataSource: DataSource) {}

  async save(
    pendingSignup: PendingSignup,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager
      ? manager.getRepository(PendingSignupOrmEntity)
      : this.dataSource.getRepository(PendingSignupOrmEntity)
    ).save(toOrm(pendingSignup));
  }

  async findByEmail(
    email: string,
    manager?: EntityManager,
  ): Promise<PendingSignup | null> {
    const repository = manager
      ? manager.getRepository(PendingSignupOrmEntity)
      : this.dataSource.getRepository(PendingSignupOrmEntity);
    const row = manager
      ? await repository
          .createQueryBuilder('pendingSignup')
          .setLock('pessimistic_write')
          .where('pendingSignup.email = :email', { email })
          .getOne()
      : await repository.findOne({ where: { email } });
    return row ? toDomain(row) : null;
  }

  async findByTaxCode(
    taxCode: string,
    manager?: EntityManager,
  ): Promise<PendingSignup | null> {
    const repository = manager
      ? manager.getRepository(PendingSignupOrmEntity)
      : this.dataSource.getRepository(PendingSignupOrmEntity);
    const row = manager
      ? await repository
          .createQueryBuilder('pendingSignup')
          .setLock('pessimistic_write')
          .where('pendingSignup.taxCode = :taxCode', { taxCode })
          .getOne()
      : await repository.findOne({ where: { taxCode } });
    return row ? toDomain(row) : null;
  }

  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager
      ? manager.getRepository(PendingSignupOrmEntity)
      : this.dataSource.getRepository(PendingSignupOrmEntity)
    ).delete(id);
  }
}
