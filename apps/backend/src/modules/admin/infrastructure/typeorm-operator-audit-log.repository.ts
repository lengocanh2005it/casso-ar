import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { IOperatorAuditLogRepository } from '../application/operator-audit-log-repository.port';
import type { OperatorAuditLog } from '../domain/operator-audit-log';
import { OperatorAuditLogOrmEntity } from './operator-audit-log.orm-entity';

function toOrm(log: OperatorAuditLog): OperatorAuditLogOrmEntity {
  const row = new OperatorAuditLogOrmEntity();
  row.id = log.id;
  row.operatorId = log.operatorId;
  row.organizationId = log.organizationId;
  row.actionType = log.actionType;
  row.membershipId = log.membershipId;
  row.createdAt = log.createdAt;
  return row;
}

@Injectable()
export class TypeOrmOperatorAuditLogRepository
  implements IOperatorAuditLogRepository
{
  constructor(
    @InjectRepository(OperatorAuditLogOrmEntity)
    private readonly repo: Repository<OperatorAuditLogOrmEntity>,
  ) {}

  async save(log: OperatorAuditLog, manager?: EntityManager): Promise<void> {
    await (manager
      ? manager.getRepository(OperatorAuditLogOrmEntity)
      : this.repo
    ).save(toOrm(log));
  }
}
