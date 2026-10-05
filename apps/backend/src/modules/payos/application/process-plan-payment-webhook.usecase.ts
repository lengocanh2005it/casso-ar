import { createHash } from 'node:crypto';
import {
  PeriodChargeStatus,
  PlanPaymentHistoryProvenance,
  PlanPaymentHistorySourceType,
  PlanPaymentReceiptOutcome,
  PlanUpgradeOrderStatus,
} from '@casso-ar/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { AuditLog } from '../../../common/audit/audit-log';
import {
  AUDIT_LOG_REPOSITORY,
  type IAuditLogRepository,
} from '../../../common/audit/audit-log-repository.port';
import { ChangeSubscriptionPlanUseCase } from '../../billing/application/change-subscription-plan.usecase';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../../billing/application/subscription-repository.port';
import { PeriodCharge } from '../domain/period-charge';
import { decidePlanPaymentReceiptOutcome } from '../domain/plan-payment-receipt';
import { PlanUpgradeOrder } from '../domain/plan-upgrade-order';
import {
  type IPayosPaymentAdapter,
  PAYOS_PAYMENT_ADAPTER,
  type PayosPaymentLinkSnapshot,
} from './payos-payment-adapter.port';
import {
  type IPeriodChargeRepository,
  PERIOD_CHARGE_REPOSITORY,
} from './period-charge-repository.port';
import {
  type IPlanPaymentHistoryRepository,
  PLAN_PAYMENT_HISTORY_REPOSITORY,
} from './plan-payment-history-repository.port';
import {
  type IPlanUpgradeOrderRepository,
  PLAN_UPGRADE_ORDER_REPOSITORY,
} from './plan-upgrade-order-repository.port';

export interface ProcessPlanPaymentWebhookInput {
  signature: string;
  data: {
    orderCode: number;
    amount: unknown;
    code: string;
    paymentLinkId?: string;
    reference?: string;
    transactionDateTime?: string;
  };
}

type PaymentSource =
  | {
      sourceType: PlanPaymentHistorySourceType.PLAN_UPGRADE_ORDER;
      source: PlanUpgradeOrder;
    }
  | {
      sourceType: PlanPaymentHistorySourceType.PERIOD_CHARGE;
      source: PeriodCharge;
    };

function getPositiveSafeAmount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isSnapshotPaidForSource(
  snapshot: PayosPaymentLinkSnapshot | null,
  source: PaymentSource,
  input: ProcessPlanPaymentWebhookInput,
): boolean {
  const { source: row } = source;
  const quotedAmount = row.quotedAmount;
  const paymentLinkId = row.payosPaymentLinkId ?? input.data.paymentLinkId;
  if (
    !snapshot ||
    !paymentLinkId ||
    (input.data.paymentLinkId !== undefined &&
      input.data.paymentLinkId !== paymentLinkId) ||
    snapshot.paymentLinkId !== paymentLinkId ||
    snapshot.orderCode !== row.orderCode ||
    snapshot.status !== 'PAID' ||
    quotedAmount === null ||
    snapshot.amount !== quotedAmount ||
    snapshot.amountPaid !== quotedAmount ||
    snapshot.amountRemaining !== 0 ||
    !Array.isArray(snapshot.transactions) ||
    snapshot.transactions.length !== 1
  ) {
    return false;
  }

  const transaction = snapshot.transactions[0];
  return (
    transaction.reference === input.data.reference &&
    transaction.amount === input.data.amount &&
    transaction.transactionDateTime === input.data.transactionDateTime
  );
}

function getUniqueTransferIdentity(
  snapshot: PayosPaymentLinkSnapshot | null,
  source: PaymentSource,
  input: ProcessPlanPaymentWebhookInput,
): string | null {
  const paymentLinkId =
    source.source.payosPaymentLinkId ?? input.data.paymentLinkId;
  if (
    !snapshot ||
    !paymentLinkId ||
    snapshot.paymentLinkId !== paymentLinkId ||
    snapshot.orderCode !== source.source.orderCode ||
    !Array.isArray(snapshot.transactions) ||
    snapshot.transactions.length !== 1 ||
    !input.data.reference ||
    !input.data.transactionDateTime
  ) {
    return null;
  }

  const [transaction] = snapshot.transactions;
  if (
    transaction.reference !== input.data.reference ||
    transaction.amount !== input.data.amount ||
    transaction.transactionDateTime !== input.data.transactionDateTime
  ) {
    return null;
  }

  // A link ID identifies one transfer only while the provider snapshot has a
  // single matching transaction. Multi-transfer links stay review-only.
  return hash(snapshot.paymentLinkId);
}

function hasCurrentEligibility(
  source: PaymentSource,
  subscription: Awaited<
    ReturnType<ISubscriptionRepository['lockAndFindByOrganizationId']>
  >,
): boolean {
  if (!subscription) return false;
  if (source.sourceType === PlanPaymentHistorySourceType.PLAN_UPGRADE_ORDER) {
    return subscription.isUpgradeTo(source.source.targetPlanId);
  }

  return (
    subscription.planId === source.source.planId &&
    subscription.currentPeriodStart.getTime() ===
      source.source.periodStart.getTime() &&
    subscription.currentPeriodEnd.getTime() ===
      source.source.periodEnd.getTime()
  );
}

function withConfirmedPaymentLink(
  source: PaymentSource,
  snapshot: PayosPaymentLinkSnapshot | null,
): PaymentSource {
  if (!snapshot || source.source.payosPaymentLinkId) return source;
  if (source.sourceType === PlanPaymentHistorySourceType.PLAN_UPGRADE_ORDER) {
    return {
      ...source,
      source: source.source.withPayosPaymentLinkId(snapshot.paymentLinkId),
    };
  }
  return {
    ...source,
    source: source.source.withPayosPaymentLinkId(snapshot.paymentLinkId),
  };
}

@Injectable()
export class ProcessPlanPaymentWebhookUseCase {
  constructor(
    @Inject(PLAN_UPGRADE_ORDER_REPOSITORY)
    private readonly orderRepo: IPlanUpgradeOrderRepository,
    @Inject(PERIOD_CHARGE_REPOSITORY)
    private readonly chargeRepo: IPeriodChargeRepository,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepo: ISubscriptionRepository,
    @Inject(PLAN_PAYMENT_HISTORY_REPOSITORY)
    private readonly historyRepo: IPlanPaymentHistoryRepository,
    @Inject(PAYOS_PAYMENT_ADAPTER)
    private readonly payosAdapter: IPayosPaymentAdapter,
    private readonly changePlanUseCase: ChangeSubscriptionPlanUseCase,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: ProcessPlanPaymentWebhookInput): Promise<void> {
    if (
      !Number.isSafeInteger(input.data.orderCode) ||
      input.data.orderCode <= 0
    ) {
      return;
    }

    if (input.data.code !== '00') {
      await this.dataSource.transaction(async (manager) => {
        const source = await this.lockSource(input.data.orderCode, manager);
        if (
          source?.sourceType ===
            PlanPaymentHistorySourceType.PLAN_UPGRADE_ORDER &&
          source.source.status === PlanUpgradeOrderStatus.PENDING
        ) {
          await this.orderRepo.save(
            source.source.markFailed(),
            manager,
            source.source.organizationId,
          );
        } else if (
          source?.sourceType === PlanPaymentHistorySourceType.PERIOD_CHARGE &&
          source.source.status === PeriodChargeStatus.PENDING
        ) {
          await this.chargeRepo.save(
            source.source.markFailed(),
            manager,
            source.source.organizationId,
          );
        }
      });
      return;
    }

    const preflight = await this.dataSource.transaction((manager) =>
      this.lockSource(input.data.orderCode, manager),
    );
    if (!preflight) return;
    if (
      preflight.source.payosPaymentLinkId &&
      input.data.paymentLinkId !== undefined &&
      input.data.paymentLinkId !== preflight.source.payosPaymentLinkId
    ) {
      return;
    }

    let snapshot: PayosPaymentLinkSnapshot | null = null;
    let providerLinkNotFound = false;
    const paymentLinkId =
      preflight.source.payosPaymentLinkId ?? input.data.paymentLinkId;
    if (paymentLinkId) {
      try {
        snapshot = await this.payosAdapter.getPaymentLink(paymentLinkId);
        providerLinkNotFound = snapshot === null;
      } catch {
        // A signed receipt is still persisted as review-required if provider verification is unavailable.
      }
    }
    if (
      !preflight.source.payosPaymentLinkId &&
      paymentLinkId &&
      providerLinkNotFound
    ) {
      return;
    }
    if (
      snapshot &&
      (snapshot.paymentLinkId !== paymentLinkId ||
        snapshot.orderCode !== preflight.source.orderCode)
    ) {
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      const source = await this.lockSourceById(preflight, manager);
      if (!source) return;
      if (
        source.source.payosPaymentLinkId &&
        input.data.paymentLinkId !== undefined &&
        input.data.paymentLinkId !== source.source.payosPaymentLinkId
      ) {
        return;
      }
      if (
        snapshot &&
        (snapshot.paymentLinkId !==
          (source.source.payosPaymentLinkId ?? input.data.paymentLinkId) ||
          snapshot.orderCode !== source.source.orderCode)
      ) {
        return;
      }

      const subscription =
        await this.subscriptionRepo.lockAndFindByOrganizationId(
          source.source.organizationId,
          manager,
        );
      const eligible =
        source.source.status === PlanUpgradeOrderStatus.PENDING &&
        hasCurrentEligibility(source, subscription) &&
        isSnapshotPaidForSource(snapshot, source, input);
      const transferIdentity = getUniqueTransferIdentity(
        snapshot,
        source,
        input,
      );
      const outcome = decidePlanPaymentReceiptOutcome({
        receivedAmount: input.data.amount,
        quotedAmount: source.source.quotedAmount,
        hasVerifiedTransferIdentity: transferIdentity !== null,
        isEligible: eligible,
      });
      const confirmedAt = new Date();
      const inserted = await this.historyRepo.insertIfAbsent(
        {
          organizationId: source.source.organizationId,
          sourceType: source.sourceType,
          sourceId: source.source.id,
          orderCode: source.source.orderCode,
          planId:
            source.sourceType ===
            PlanPaymentHistorySourceType.PLAN_UPGRADE_ORDER
              ? source.source.targetPlanId
              : source.source.planId,
          periodStart:
            source.sourceType === PlanPaymentHistorySourceType.PERIOD_CHARGE
              ? source.source.periodStart
              : null,
          periodEnd:
            source.sourceType === PlanPaymentHistorySourceType.PERIOD_CHARGE
              ? source.source.periodEnd
              : null,
          receivedAmount: getPositiveSafeAmount(input.data.amount),
          quotedAmount: source.source.quotedAmount,
          payosPaymentLinkId:
            snapshot?.paymentLinkId ??
            source.source.payosPaymentLinkId ??
            input.data.paymentLinkId ??
            null,
          providerReference: input.data.reference ?? null,
          providerTransactionTime: input.data.transactionDateTime ?? null,
          transferIdentity,
          deliveryFingerprint: hash(input.signature),
          initialOutcome: outcome,
          provenance: PlanPaymentHistoryProvenance.PAYOS_WEBHOOK,
          confirmedAt,
        },
        manager,
      );
      if (!inserted) return;

      if (outcome === PlanPaymentReceiptOutcome.ACCEPTED) {
        const confirmedSource = withConfirmedPaymentLink(source, snapshot);
        if (
          confirmedSource.sourceType ===
          PlanPaymentHistorySourceType.PLAN_UPGRADE_ORDER
        ) {
          await this.changePlanUseCase.execute(
            confirmedSource.source.organizationId,
            confirmedSource.source.targetPlanId,
            manager,
          );
          await this.orderRepo.save(
            confirmedSource.source.markPaid(),
            manager,
            confirmedSource.source.organizationId,
          );
          await this.auditLogRepo.create(
            new AuditLog({
              organizationId: confirmedSource.source.organizationId,
              userId: 'system',
              actionType: AuditActionType.SUBSCRIPTION_CHANGE_PLAN,
              entityType: AuditEntityType.SUBSCRIPTION,
              entityId: confirmedSource.source.organizationId,
              beforeState: null,
              afterState: {
                planId: confirmedSource.source.targetPlanId,
                orderCode: confirmedSource.source.orderCode,
              },
              ipAddress: null,
              createdAt: confirmedAt,
            }),
            manager,
          );
        } else {
          await this.chargeRepo.save(
            confirmedSource.source.markPaid(),
            manager,
            confirmedSource.source.organizationId,
          );
          await this.auditLogRepo.create(
            new AuditLog({
              organizationId: confirmedSource.source.organizationId,
              userId: 'system',
              actionType: AuditActionType.PERIOD_CHARGE_PAID,
              entityType: AuditEntityType.PERIOD_CHARGE,
              entityId: confirmedSource.source.organizationId,
              beforeState: null,
              afterState: {
                planId: confirmedSource.source.planId,
                orderCode: confirmedSource.source.orderCode,
                periodStart: confirmedSource.source.periodStart.toISOString(),
                periodEnd: confirmedSource.source.periodEnd.toISOString(),
              },
              ipAddress: null,
              createdAt: confirmedAt,
            }),
            manager,
          );
        }
      } else if (
        source.source.status === PlanUpgradeOrderStatus.PENDING ||
        source.source.status === PlanUpgradeOrderStatus.FAILED
      ) {
        const confirmedSource = withConfirmedPaymentLink(source, snapshot);
        if (
          confirmedSource.sourceType ===
          PlanPaymentHistorySourceType.PLAN_UPGRADE_ORDER
        ) {
          await this.orderRepo.save(
            confirmedSource.source.markReviewRequired(),
            manager,
            confirmedSource.source.organizationId,
          );
        } else {
          await this.chargeRepo.save(
            confirmedSource.source.markReviewRequired(),
            manager,
            confirmedSource.source.organizationId,
          );
        }
      }
    });
  }

  private async lockSource(
    orderCode: number,
    manager: EntityManager,
  ): Promise<PaymentSource | null> {
    // This first lookup resolves the tenant for a public webhook. The success
    // path re-reads the row by id and organizationId before making any writes.
    const order = await this.orderRepo.lockAndFindByOrderCode(
      orderCode,
      manager,
    );
    if (order) {
      return {
        sourceType: PlanPaymentHistorySourceType.PLAN_UPGRADE_ORDER,
        source: order,
      };
    }
    const charge = await this.chargeRepo.lockAndFindByOrderCode(
      orderCode,
      manager,
    );
    if (charge) {
      return {
        sourceType: PlanPaymentHistorySourceType.PERIOD_CHARGE,
        source: charge,
      };
    }
    return null;
  }

  private async lockSourceById(
    source: PaymentSource,
    manager: EntityManager,
  ): Promise<PaymentSource | null> {
    if (source.sourceType === PlanPaymentHistorySourceType.PLAN_UPGRADE_ORDER) {
      const order = await this.orderRepo.lockAndFindByIdAndOrganizationId(
        source.source.id,
        source.source.organizationId,
        manager,
      );
      return order ? { sourceType: source.sourceType, source: order } : null;
    }

    const charge = await this.chargeRepo.lockAndFindByIdAndOrganizationId(
      source.source.id,
      source.source.organizationId,
      manager,
    );
    return charge ? { sourceType: source.sourceType, source: charge } : null;
  }
}
