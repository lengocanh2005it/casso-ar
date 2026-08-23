import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource, In, Not } from 'typeorm';
import type { IOwnershipTransferRequestRepository } from '../application/ownership-transfer-request-repository.port';
import { OwnershipTransferRequest } from '../domain/ownership-transfer-request';
import { OwnershipTransferRequestOrmEntity } from './ownership-transfer-request.orm-entity';

const TERMINAL_STATUSES = ['ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'];

function toDomain(
  row: OwnershipTransferRequestOrmEntity,
): OwnershipTransferRequest {
  return new OwnershipTransferRequest({
    id: row.id,
    organizationId: row.organizationId,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    status: row.status,
    otpHash: row.otpHash,
    otpExpiresAt: row.otpExpiresAt,
    acceptanceExpiresAt: row.acceptanceExpiresAt,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
  });
}

function toOrm(
  request: OwnershipTransferRequest,
): OwnershipTransferRequestOrmEntity {
  const row = new OwnershipTransferRequestOrmEntity();
  row.id = request.id;
  row.organizationId = request.organizationId;
  row.fromUserId = request.fromUserId;
  row.toUserId = request.toUserId;
  row.status = request.status;
  row.otpHash = request.otpHash;
  row.otpExpiresAt = request.otpExpiresAt;
  row.acceptanceExpiresAt = request.acceptanceExpiresAt;
  row.resolvedAt = request.resolvedAt;
  row.createdAt = request.createdAt;
  return row;
}

@Injectable()
export class TypeOrmOwnershipTransferRequestRepository
  implements IOwnershipTransferRequestRepository
{
  constructor(private readonly dataSource: DataSource) {}

  async save(
    request: OwnershipTransferRequest,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager
      ? manager.getRepository(OwnershipTransferRequestOrmEntity)
      : this.dataSource.getRepository(OwnershipTransferRequestOrmEntity)
    ).save(toOrm(request));
  }

  async findById(
    id: string,
    organizationId: string,
    manager?: EntityManager,
  ): Promise<OwnershipTransferRequest | null> {
    const repository = manager
      ? manager.getRepository(OwnershipTransferRequestOrmEntity)
      : this.dataSource.getRepository(OwnershipTransferRequestOrmEntity);
    const row = manager
      ? await repository
          .createQueryBuilder('request')
          .setLock('pessimistic_write')
          .where('request.id = :id', { id })
          .andWhere('request.organizationId = :organizationId', {
            organizationId,
          })
          .getOne()
      : await repository.findOne({ where: { id, organizationId } });
    return row ? toDomain(row) : null;
  }

  async findNonTerminalByOrganization(
    organizationId: string,
    manager?: EntityManager,
  ): Promise<OwnershipTransferRequest | null> {
    const repository = manager
      ? manager.getRepository(OwnershipTransferRequestOrmEntity)
      : this.dataSource.getRepository(OwnershipTransferRequestOrmEntity);
    const row = manager
      ? await repository
          .createQueryBuilder('request')
          .setLock('pessimistic_write')
          .where('request.organizationId = :organizationId', {
            organizationId,
          })
          .andWhere('request.status NOT IN (:...terminal)', {
            terminal: TERMINAL_STATUSES,
          })
          .getOne()
      : await repository.findOne({
          where: {
            organizationId,
            status: Not(In(TERMINAL_STATUSES)),
          },
        });
    return row ? toDomain(row) : null;
  }
}
