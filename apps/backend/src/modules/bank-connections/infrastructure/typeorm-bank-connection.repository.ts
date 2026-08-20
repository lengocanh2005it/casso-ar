import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  type EntityManager,
  type FindOptionsWhere,
  In,
  type Repository,
} from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IBankConnectionRepository } from '../application/bank-connection-repository.port';
import { BankConnection } from '../domain/bank-connection';
import { BankConnectionOrmEntity } from './bank-connection.orm-entity';

@Injectable()
export class TypeOrmBankConnectionRepository
  extends BaseRepository<BankConnectionOrmEntity>
  implements IBankConnectionRepository
{
  constructor(
    @InjectRepository(BankConnectionOrmEntity)
    repo: Repository<BankConnectionOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<BankConnection | null> {
    const row = await this.scopedFindOne({
      id,
    } as FindOptionsWhere<BankConnectionOrmEntity>);
    return row ? new BankConnection(row) : null;
  }

  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<BankConnection | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await manager.findOne(BankConnectionOrmEntity, {
      where: { id, organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? new BankConnection(row) : null;
  }

  async findByIdUnscoped(id: string): Promise<BankConnection | null> {
    const row = await this.ormRepo.findOne({ where: { id } });
    return row ? new BankConnection(row) : null;
  }

  async findByAccountNumber(
    accountNumber: string,
  ): Promise<BankConnection | null> {
    const row = await this.ormRepo.findOne({ where: { accountNumber } });
    return row ? new BankConnection(row) : null;
  }

  async findByAccountNumbers(
    accountNumbers: string[],
  ): Promise<Map<string, BankConnection>> {
    if (accountNumbers.length === 0) return new Map();
    const rows = await this.ormRepo.find({
      where: { accountNumber: In(accountNumbers) },
    });
    return new Map(
      rows.map((row) => [row.accountNumber, new BankConnection(row)]),
    );
  }

  async save(
    connection: BankConnection,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scopedSaveWithManager(
      connection,
      manager,
      connection.organizationId,
    );
  }

  async findPage(
    organizationId: string,
    page: number,
    limit: number,
  ): Promise<BankConnection[]> {
    const rows = await this.ormRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return rows.map((row) => new BankConnection(row));
  }

  async count(organizationId: string): Promise<number> {
    return this.ormRepo.count({ where: { organizationId } });
  }

  async hasActiveByOrganization(organizationId: string): Promise<boolean> {
    return (
      (await this.ormRepo.count({
        where: { organizationId, status: 'ACTIVE' },
      })) > 0
    );
  }

  async countActiveByOrganization(
    organizationId: string,
    manager: EntityManager,
  ): Promise<number> {
    const rows: Array<{ count: string }> = await manager.query(
      'SELECT COUNT(*) as count FROM bank_connections WHERE "organizationId" = $1 AND status = $2',
      [organizationId, 'ACTIVE'],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async countActiveByAuthorization(
    cassoFlowAuthorizationId: string,
    manager: EntityManager,
  ): Promise<number> {
    const rows: Array<{ count: string }> = await manager.query(
      'SELECT COUNT(*) as count FROM bank_connections WHERE "cassoFlowAuthorizationId" = $1 AND status = $2',
      [cassoFlowAuthorizationId, 'ACTIVE'],
    );
    return Number(rows[0]?.count ?? 0);
  }
}
