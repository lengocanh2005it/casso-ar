import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IBankTransactionRepository } from '../application/bank-transaction-repository.port';
import {
  BankTransaction,
  type BankTransactionStatus,
} from '../domain/bank-transaction';
import { BankTransactionOrmEntity } from './bank-transaction.orm-entity';

function toOrm(transaction: BankTransaction): BankTransactionOrmEntity {
  return {
    id: transaction.id,
    organizationId: transaction.organizationId,
    bankConnectionId: transaction.bankConnectionId,
    webhookInboxId: transaction.webhookInboxId,
    providerTransactionId: transaction.providerTransactionId,
    amount: transaction.amount,
    transactionDateTime: transaction.transactionDateTime,
    counterpartyAccountNumber: transaction.counterpartyAccountNumber,
    counterpartyName: transaction.counterpartyName,
    transferContent: transaction.transferContent,
    status: transaction.status,
    version: transaction.version,
    createdAt: transaction.createdAt,
  };
}

@Injectable()
export class TypeOrmBankTransactionRepository
  extends BaseRepository<BankTransactionOrmEntity>
  implements IBankTransactionRepository
{
  constructor(
    @InjectRepository(BankTransactionOrmEntity)
    repo: Repository<BankTransactionOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async save(
    transaction: BankTransaction,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scopedSaveWithManager(toOrm(transaction), manager);
  }

  async findById(id: string): Promise<BankTransaction | null> {
    const row = await this.scopedFindOne({ id });
    return row ? new BankTransaction(row) : null;
  }

  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<BankTransaction | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await manager.findOne(BankTransactionOrmEntity, {
      where: { id, organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? new BankTransaction(row) : null;
  }

  async findManyByStatus(
    status: BankTransactionStatus,
    options?: { skip?: number; take?: number },
  ): Promise<BankTransaction[]> {
    const rows = await this.scopedFindMany(
      { status },
      { order: { createdAt: 'ASC' }, ...options },
    );
    return rows.map((row) => new BankTransaction(row));
  }

  async countByStatus(status: BankTransactionStatus): Promise<number> {
    const organizationId = this.tenantContext.getOrganizationId();
    return this.ormRepo.count({ where: { organizationId, status } });
  }
}
