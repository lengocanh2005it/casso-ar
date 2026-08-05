import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { IConnectionAuditEventRepository } from '../application/connection-audit-event-repository.port';
import type { ConnectionAuditEvent } from '../domain/connection-audit-event';
import { ConnectionAuditEventOrmEntity } from './connection-audit-event.orm-entity';

@Injectable()
export class TypeOrmConnectionAuditEventRepository
  implements IConnectionAuditEventRepository
{
  constructor(
    @InjectRepository(ConnectionAuditEventOrmEntity)
    private readonly repo: Repository<ConnectionAuditEventOrmEntity>,
  ) {}

  async save(
    event: ConnectionAuditEvent,
    manager?: EntityManager,
  ): Promise<void> {
    const repo =
      manager?.getRepository(ConnectionAuditEventOrmEntity) ?? this.repo;
    await repo.insert(event as unknown as Parameters<typeof repo.insert>[0]);
  }
}
