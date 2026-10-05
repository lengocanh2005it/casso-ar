import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type {
  CreatePlanPaymentHistoryInput,
  IPlanPaymentHistoryRepository,
  PlanPaymentHistoryPage,
  PlanPaymentHistoryPageQuery,
} from '../application/plan-payment-history-repository.port';
import { PlanPaymentHistoryOrmEntity } from './plan-payment-history.orm-entity';

interface PlanPaymentHistoryRow {
  sourceType: PlanPaymentHistoryOrmEntity['sourceType'];
  orderCode: string;
  planId: PlanPaymentHistoryOrmEntity['planId'];
  receivedAmount: number | string | null;
  initialOutcome: PlanPaymentHistoryOrmEntity['initialOutcome'];
  provenance: PlanPaymentHistoryOrmEntity['provenance'];
  confirmedAt: Date;
}

function toOrm(
  input: CreatePlanPaymentHistoryInput,
): Omit<PlanPaymentHistoryOrmEntity, 'id'> {
  return {
    organizationId: input.organizationId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    orderCode: String(input.orderCode),
    planId: input.planId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    receivedAmount: input.receivedAmount,
    quotedAmount: input.quotedAmount,
    payosPaymentLinkId: input.payosPaymentLinkId,
    providerReference: input.providerReference,
    providerTransactionTime: input.providerTransactionTime,
    transferIdentity: input.transferIdentity,
    deliveryFingerprint: input.deliveryFingerprint,
    initialOutcome: input.initialOutcome,
    provenance: input.provenance,
    confirmedAt: input.confirmedAt,
    createdAt: new Date(),
  };
}

@Injectable()
export class TypeOrmPlanPaymentHistoryRepository
  implements IPlanPaymentHistoryRepository
{
  constructor(
    @InjectRepository(PlanPaymentHistoryOrmEntity)
    private readonly repository: Repository<PlanPaymentHistoryOrmEntity>,
  ) {}

  async insertIfAbsent(
    input: CreatePlanPaymentHistoryInput,
    manager: EntityManager,
  ): Promise<boolean> {
    const result = await manager
      .getRepository(PlanPaymentHistoryOrmEntity)
      .createQueryBuilder()
      .insert()
      .values(toOrm(input))
      .orIgnore()
      .returning('id')
      .execute();
    return result.identifiers.length > 0;
  }

  async findPage(
    query: PlanPaymentHistoryPageQuery,
  ): Promise<PlanPaymentHistoryPage> {
    const historyQuery = this.repository
      .createQueryBuilder('history')
      .select('history.sourceType', 'sourceType')
      .addSelect('history."orderCode"::text', 'orderCode')
      .addSelect('history.planId', 'planId')
      .addSelect('history.receivedAmount', 'receivedAmount')
      .addSelect('history.initialOutcome', 'initialOutcome')
      .addSelect('history.provenance', 'provenance')
      .addSelect('history.confirmedAt', 'confirmedAt')
      .where('history.organizationId = :organizationId', {
        organizationId: query.organizationId,
      })
      .orderBy('history.confirmedAt', 'DESC')
      .addOrderBy('history.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const [rows, total] = await Promise.all([
      historyQuery.getRawMany<PlanPaymentHistoryRow>(),
      this.repository.count({
        where: { organizationId: query.organizationId },
      }),
    ]);

    return {
      items: rows.map((row) => ({
        sourceType: row.sourceType,
        orderCode: row.orderCode,
        planId: row.planId,
        receivedAmount:
          row.receivedAmount === null ? null : Number(row.receivedAmount),
        initialOutcome: row.initialOutcome,
        provenance: row.provenance,
        confirmedAt: row.confirmedAt,
      })),
      total,
    };
  }
}
