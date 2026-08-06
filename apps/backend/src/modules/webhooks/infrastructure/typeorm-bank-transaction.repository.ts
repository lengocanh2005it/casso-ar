import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { IBankTransactionRepository } from '../application/bank-transaction-repository.port';
import { BankTransaction } from '../domain/bank-transaction';
import { BankTransactionOrmEntity } from './bank-transaction.orm-entity';

function toOrm(transaction: BankTransaction): BankTransactionOrmEntity {
  return Object.assign(new BankTransactionOrmEntity(), transaction);
}

@Injectable()
export class TypeOrmBankTransactionRepository
  implements IBankTransactionRepository
{
  constructor(
    @InjectRepository(BankTransactionOrmEntity)
    private readonly repo: Repository<BankTransactionOrmEntity>,
  ) {}
  async save(
    transaction: BankTransaction,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager?.getRepository(BankTransactionOrmEntity) ?? this.repo).save(
      toOrm(transaction),
    );
  }
  async findById(
    id: string,
    organizationId: string,
  ): Promise<BankTransaction | null> {
    const row = await this.repo.findOne({ where: { id, organizationId } });
    return row ? new BankTransaction(row) : null;
  }
}
