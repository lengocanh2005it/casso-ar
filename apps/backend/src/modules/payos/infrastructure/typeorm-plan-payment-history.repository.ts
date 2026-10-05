import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type {
  CreatePlanPaymentHistoryInput,
  IPlanPaymentHistoryRepository,
} from '../application/plan-payment-history-repository.port';
import { PlanPaymentHistoryOrmEntity } from './plan-payment-history.orm-entity';

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
}
