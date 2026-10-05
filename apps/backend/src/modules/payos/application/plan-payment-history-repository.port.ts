import type {
  PlanId,
  PlanPaymentHistoryProvenance,
  PlanPaymentHistorySourceType,
  PlanPaymentReceiptOutcome,
} from '@casso-ar/shared-types';
import type { EntityManager } from 'typeorm';

export interface CreatePlanPaymentHistoryInput {
  organizationId: string;
  sourceType: PlanPaymentHistorySourceType;
  sourceId: string;
  orderCode: number;
  planId: PlanId;
  periodStart: Date | null;
  periodEnd: Date | null;
  receivedAmount: number | null;
  quotedAmount: number | null;
  payosPaymentLinkId: string | null;
  providerReference: string | null;
  providerTransactionTime: string | null;
  transferIdentity: string | null;
  deliveryFingerprint: string | null;
  initialOutcome: PlanPaymentReceiptOutcome;
  provenance: PlanPaymentHistoryProvenance;
  confirmedAt: Date;
}

export interface IPlanPaymentHistoryRepository {
  insertIfAbsent(
    input: CreatePlanPaymentHistoryInput,
    manager: EntityManager,
  ): Promise<boolean>;
}

export const PLAN_PAYMENT_HISTORY_REPOSITORY = Symbol(
  'PLAN_PAYMENT_HISTORY_REPOSITORY',
);
