import { createHash } from 'node:crypto';
import {
  PlanId,
  PlanPaymentReceiptOutcome,
  PlanUpgradeOrderStatus,
} from '@casso-ar/shared-types';
import { DataSource } from 'typeorm';
import type { IAuditLogRepository } from '../../../common/audit/audit-log-repository.port';
import type { ChangeSubscriptionPlanUseCase } from '../../billing/application/change-subscription-plan.usecase';
import type { ISubscriptionRepository } from '../../billing/application/subscription-repository.port';
import { Subscription } from '../../billing/domain/subscription';
import { PlanUpgradeOrder } from '../domain/plan-upgrade-order';
import type { IPayosPaymentAdapter } from './payos-payment-adapter.port';
import type { IPeriodChargeRepository } from './period-charge-repository.port';
import type { IPlanPaymentHistoryRepository } from './plan-payment-history-repository.port';
import type { IPlanUpgradeOrderRepository } from './plan-upgrade-order-repository.port';
import { ProcessPlanPaymentWebhookUseCase } from './process-plan-payment-webhook.usecase';

function buildOrder(): PlanUpgradeOrder {
  return new PlanUpgradeOrder({
    id: 'order-1',
    orderCode: 1001,
    organizationId: 'org-1',
    targetPlanId: PlanId.STARTER,
    quotedAmount: 299000,
    payosPaymentLinkId: 'link-1',
    status: PlanUpgradeOrderStatus.PENDING,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
  });
}

describe('ProcessPlanPaymentWebhookUseCase', () => {
  function buildDeps() {
    const order = buildOrder();
    const orderRepo = {
      create: jest.fn(),
      lockAndFindByOrderCode: jest.fn().mockResolvedValue(order),
      lockAndFindByIdAndOrganizationId: jest.fn().mockResolvedValue(order),
      save: jest.fn(),
      existsPaidWithinRange: jest.fn(),
    } as unknown as jest.Mocked<IPlanUpgradeOrderRepository>;
    const chargeRepo = {
      create: jest.fn(),
      lockAndFindByOrderCode: jest.fn(),
      lockAndFindByIdAndOrganizationId: jest.fn(),
      save: jest.fn(),
      findLatestByOrganizationAndPeriodStart: jest.fn(),
    } as unknown as jest.Mocked<IPeriodChargeRepository>;
    const subscriptionRepo = {
      lockAndFindByOrganizationId: jest
        .fn()
        .mockResolvedValue(
          Subscription.createFree('sub-1', 'org-1', new Date('2026-10-01')),
        ),
    } as unknown as jest.Mocked<ISubscriptionRepository>;
    const historyRepo = {
      insertIfAbsent: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<IPlanPaymentHistoryRepository>;
    const adapter = {
      createPaymentLink: jest.fn(),
      getPaymentLink: jest.fn().mockResolvedValue({
        paymentLinkId: 'link-1',
        orderCode: 1001,
        amount: 299000,
        amountPaid: 299000,
        amountRemaining: 0,
        status: 'PAID',
        transactions: [
          {
            reference: 'bank-ref-1',
            amount: 299000,
            transactionDateTime: '2026-10-05 10:00:00',
          },
        ],
      }),
    } as unknown as jest.Mocked<IPayosPaymentAdapter>;
    const changePlanUseCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ChangeSubscriptionPlanUseCase>;
    const auditLogRepo = {
      create: jest.fn(),
    } as unknown as jest.Mocked<IAuditLogRepository>;
    const manager = {};
    const dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => unknown) =>
        callback(manager),
      ),
    } as unknown as DataSource;
    const useCase = new ProcessPlanPaymentWebhookUseCase(
      orderRepo,
      chargeRepo,
      subscriptionRepo,
      historyRepo,
      adapter,
      changePlanUseCase,
      auditLogRepo,
      dataSource,
    );
    return {
      useCase,
      order,
      orderRepo,
      chargeRepo,
      subscriptionRepo,
      historyRepo,
      adapter,
      changePlanUseCase,
      auditLogRepo,
      manager,
    };
  }

  const webhook = {
    signature: 'signed-data',
    data: {
      orderCode: 1001,
      amount: 299000,
      code: '00',
      paymentLinkId: 'link-1',
      reference: 'bank-ref-1',
      transactionDateTime: '2026-10-05 10:00:00',
    },
  };

  it('records a verified receipt and grants the plan in the same transaction', async () => {
    const {
      useCase,
      orderRepo,
      historyRepo,
      changePlanUseCase,
      auditLogRepo,
      manager,
    } = buildDeps();

    await useCase.execute(webhook);

    expect(orderRepo.lockAndFindByIdAndOrganizationId).toHaveBeenCalledWith(
      'order-1',
      'org-1',
      manager,
    );
    expect(orderRepo.lockAndFindByOrderCode).toHaveBeenCalledTimes(1);

    expect(historyRepo.insertIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        sourceType: 'PLAN_UPGRADE_ORDER',
        sourceId: 'order-1',
        receivedAmount: 299000,
        quotedAmount: 299000,
        initialOutcome: PlanPaymentReceiptOutcome.ACCEPTED,
        provenance: 'PAYOS_WEBHOOK',
        transferIdentity: createHash('sha256').update('link-1').digest('hex'),
      }),
      manager,
    );
    expect(changePlanUseCase.execute).toHaveBeenCalledWith(
      'org-1',
      PlanId.STARTER,
      manager,
    );
    expect(orderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: PlanUpgradeOrderStatus.PAID }),
      manager,
      'org-1',
    );
    expect(auditLogRepo.create).toHaveBeenCalled();
  });

  it('looks up the provider link from the signed callback when the source link ID is missing', async () => {
    const { useCase, orderRepo, adapter, historyRepo, order } = buildDeps();
    const sourceWithoutLink = new PlanUpgradeOrder({
      ...order,
      quotedAmount: null,
      payosPaymentLinkId: null,
    });
    orderRepo.lockAndFindByOrderCode.mockResolvedValue(sourceWithoutLink);
    orderRepo.lockAndFindByIdAndOrganizationId.mockResolvedValue(
      sourceWithoutLink,
    );
    adapter.getPaymentLink.mockResolvedValue({
      paymentLinkId: 'callback-link',
      orderCode: 1001,
      amount: 299000,
      amountPaid: 299000,
      amountRemaining: 0,
      status: 'PAID',
      transactions: [
        {
          reference: 'bank-ref-1',
          amount: 299000,
          transactionDateTime: '2026-10-05 10:00:00',
        },
      ],
    });

    await useCase.execute({
      ...webhook,
      data: { ...webhook.data, paymentLinkId: 'callback-link' },
    });

    expect(adapter.getPaymentLink).toHaveBeenCalledWith('callback-link');
    expect(historyRepo.insertIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        payosPaymentLinkId: 'callback-link',
        initialOutcome: PlanPaymentReceiptOutcome.REVIEW_REQUIRED,
      }),
      expect.anything(),
    );
    expect(orderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        payosPaymentLinkId: 'callback-link',
        status: PlanUpgradeOrderStatus.REVIEW_REQUIRED,
      }),
      expect.anything(),
      'org-1',
    );
  });

  it('can confirm a quoted payment when the signed link ID was not saved locally', async () => {
    const { useCase, orderRepo, historyRepo, order } = buildDeps();
    const sourceWithoutLink = new PlanUpgradeOrder({
      ...order,
      payosPaymentLinkId: null,
    });
    orderRepo.lockAndFindByOrderCode.mockResolvedValue(sourceWithoutLink);
    orderRepo.lockAndFindByIdAndOrganizationId.mockResolvedValue(
      sourceWithoutLink,
    );

    await useCase.execute(webhook);

    expect(historyRepo.insertIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        payosPaymentLinkId: 'link-1',
        initialOutcome: PlanPaymentReceiptOutcome.ACCEPTED,
      }),
      expect.anything(),
    );
    expect(orderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        payosPaymentLinkId: 'link-1',
        status: PlanUpgradeOrderStatus.PAID,
      }),
      expect.anything(),
      'org-1',
    );
  });

  it('ignores an unknown provider link when the local source has no link ID', async () => {
    const { useCase, orderRepo, adapter, historyRepo, order } = buildDeps();
    const sourceWithoutLink = new PlanUpgradeOrder({
      ...order,
      payosPaymentLinkId: null,
    });
    orderRepo.lockAndFindByOrderCode.mockResolvedValue(sourceWithoutLink);
    adapter.getPaymentLink.mockResolvedValue(null);

    await useCase.execute({
      ...webhook,
      data: { ...webhook.data, paymentLinkId: 'registration-sample-link' },
    });

    expect(historyRepo.insertIfAbsent).not.toHaveBeenCalled();
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('retains a known callback for review when provider lookup is unavailable', async () => {
    const { useCase, orderRepo, adapter, historyRepo, order } = buildDeps();
    const sourceWithoutLink = new PlanUpgradeOrder({
      ...order,
      quotedAmount: null,
      payosPaymentLinkId: null,
    });
    orderRepo.lockAndFindByOrderCode.mockResolvedValue(sourceWithoutLink);
    orderRepo.lockAndFindByIdAndOrganizationId.mockResolvedValue(
      sourceWithoutLink,
    );
    adapter.getPaymentLink.mockRejectedValue(new Error('provider unavailable'));

    await useCase.execute({
      ...webhook,
      data: { ...webhook.data, paymentLinkId: 'callback-link' },
    });

    expect(historyRepo.insertIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        payosPaymentLinkId: 'callback-link',
        receivedAmount: 299000,
        initialOutcome: PlanPaymentReceiptOutcome.REVIEW_REQUIRED,
      }),
      expect.anything(),
    );
  });

  it('keeps multi-transfer PayOS links in review without inventing a transfer identity', async () => {
    const { useCase, adapter, historyRepo, changePlanUseCase } = buildDeps();
    adapter.getPaymentLink.mockResolvedValue({
      paymentLinkId: 'link-1',
      orderCode: 1001,
      amount: 299000,
      amountPaid: 598000,
      amountRemaining: 0,
      status: 'PAID',
      transactions: [
        {
          reference: 'bank-ref-1',
          amount: 299000,
          transactionDateTime: '2026-10-05 10:00:00',
        },
        {
          reference: 'bank-ref-2',
          amount: 299000,
          transactionDateTime: '2026-10-05 10:01:00',
        },
      ],
    });

    await useCase.execute(webhook);

    expect(historyRepo.insertIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        transferIdentity: null,
        initialOutcome: PlanPaymentReceiptOutcome.REVIEW_REQUIRED,
      }),
      expect.anything(),
    );
    expect(changePlanUseCase.execute).not.toHaveBeenCalled();
  });

  it('records a mismatched payment for review without changing the plan', async () => {
    const { useCase, adapter, historyRepo, changePlanUseCase, orderRepo } =
      buildDeps();
    adapter.getPaymentLink.mockResolvedValue({
      paymentLinkId: 'link-1',
      orderCode: 1001,
      amount: 299000,
      amountPaid: 299000,
      amountRemaining: 0,
      status: 'PAID',
      transactions: [
        {
          reference: 'bank-ref-1',
          amount: 299000,
          transactionDateTime: '2026-10-05 10:00:00',
        },
      ],
    });

    await useCase.execute({
      ...webhook,
      data: { ...webhook.data, amount: 298000 },
    });

    expect(historyRepo.insertIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        receivedAmount: 298000,
        initialOutcome: PlanPaymentReceiptOutcome.REVIEW_REQUIRED,
      }),
      expect.anything(),
    );
    expect(changePlanUseCase.execute).not.toHaveBeenCalled();
    expect(orderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: PlanUpgradeOrderStatus.REVIEW_REQUIRED,
      }),
      expect.anything(),
      'org-1',
    );
  });

  it('requires review when an upgrade is stale for the organization plan', async () => {
    const { useCase, subscriptionRepo, historyRepo, changePlanUseCase } =
      buildDeps();
    subscriptionRepo.lockAndFindByOrganizationId.mockResolvedValue(
      Subscription.createStarter('sub-1', 'org-1', new Date('2026-10-01')),
    );

    await useCase.execute(webhook);

    expect(historyRepo.insertIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        initialOutcome: PlanPaymentReceiptOutcome.REVIEW_REQUIRED,
      }),
      expect.anything(),
    );
    expect(changePlanUseCase.execute).not.toHaveBeenCalled();
  });
});
