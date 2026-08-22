import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Role } from '../../organizations/domain/membership';
import { Receivable } from '../../receivables/domain/receivable';
import { CollectionActivityType } from '../domain/collection-activity';
import { CollectionActivityListener } from './collection-activity.listener';

function buildReceivable(): Receivable {
  return new Receivable({
    id: 'rec-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    invoiceId: 'inv-1',
    originalAmount: 50_000_000,
    paidAmount: 50_000_000,
    dueDate: new Date('2026-08-20'),
    status: ReceivableStatus.PAID,
    salesRepresentativeId: 'user-1',
    createdAt: new Date('2026-07-20'),
    closedAt: new Date('2026-08-03'),
    version: 0,
  });
}

describe('CollectionActivityListener', () => {
  it('writes a PAYMENT_RECEIVED row on payment.allocated', async () => {
    const activityRepo = {
      create: jest.fn(),
      findByReceivableId: jest.fn(),
      findByCustomerId: jest.fn(),
    };
    const receivableRepo = {
      findById: jest.fn(),
      findByIdForUpdate: jest.fn(),
      save: jest.fn(),
    };
    const tenantContext = {
      run: (_user: unknown, cb: () => unknown) => cb(),
      getOrganizationId: () => 'org-1',
    };

    const listener = new CollectionActivityListener(
      activityRepo as any,
      receivableRepo as any,
      tenantContext as any,
    );

    await listener.onPaymentAllocated({
      paymentId: 'pay-1',
      receivableId: 'rec-1',
      customerId: 'cust-1',
      organizationId: 'org-1',
      amount: 30_000_000,
      allocatedByUserId: 'user-2',
    });

    expect(activityRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        receivableId: 'rec-1',
        customerId: 'cust-1',
        activityType: CollectionActivityType.PAYMENT_RECEIVED,
        createdByUserId: 'user-2',
        description: 'Đã nhận thanh toán 30.000.000 ₫ cho khoản phải thu',
        metadata: { paymentId: 'pay-1', amount: 30_000_000 },
      }),
    );
  });

  it('writes a RECEIVABLE_CLOSED row on receivable.closed', async () => {
    const activityRepo = {
      create: jest.fn(),
      findByReceivableId: jest.fn(),
      findByCustomerId: jest.fn(),
    };
    const receivableRepo = {
      findById: jest.fn(),
      findByIdForUpdate: jest.fn(),
      save: jest.fn(),
    };
    const tenantContext = {
      run: (_user: unknown, cb: () => unknown) => cb(),
      getOrganizationId: () => 'org-1',
    };

    const listener = new CollectionActivityListener(
      activityRepo as any,
      receivableRepo as any,
      tenantContext as any,
    );

    await listener.onReceivableClosed({
      receivableId: 'rec-1',
      customerId: 'cust-1',
      organizationId: 'org-1',
    });

    expect(activityRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        receivableId: 'rec-1',
        customerId: 'cust-1',
        activityType: CollectionActivityType.RECEIVABLE_CLOSED,
        createdByUserId: null,
        description: 'Khoản phải thu đã được thanh toán đầy đủ (Đã thu)',
      }),
    );
  });

  it('resolves customerId via IReceivableRepository (scoped to the event organizationId) on dispute.opened', async () => {
    const activityRepo = {
      create: jest.fn(),
      findByReceivableId: jest.fn(),
      findByCustomerId: jest.fn(),
    };
    const receivableRepo = {
      findById: jest.fn().mockResolvedValue(buildReceivable()),
      findByIdForUpdate: jest.fn(),
      save: jest.fn(),
    };
    const runSpy = jest.fn((_user: unknown, cb: () => unknown) => cb());
    const tenantContext = { run: runSpy, getOrganizationId: () => 'org-1' };

    const listener = new CollectionActivityListener(
      activityRepo as any,
      receivableRepo as any,
      tenantContext as any,
    );

    await listener.onDisputeOpened({
      disputeId: 'dis-1',
      receivableId: 'rec-1',
      organizationId: 'org-1',
    });

    expect(runSpy).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', role: Role.OWNER }),
      expect.any(Function),
    );
    expect(receivableRepo.findById).toHaveBeenCalledWith('rec-1');
    expect(activityRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        receivableId: 'rec-1',
        customerId: 'cust-1',
        activityType: CollectionActivityType.DISPUTE_OPENED,
        description: 'Đã mở khiếu nại cho khoản phải thu',
        metadata: { disputeId: 'dis-1' },
      }),
    );
  });

  it('writes a DISPUTE_RESOLVED row on dispute.resolved', async () => {
    const activityRepo = {
      create: jest.fn(),
      findByReceivableId: jest.fn(),
      findByCustomerId: jest.fn(),
    };
    const receivableRepo = {
      findById: jest.fn().mockResolvedValue(buildReceivable()),
      findByIdForUpdate: jest.fn(),
      save: jest.fn(),
    };
    const tenantContext = {
      run: (_user: unknown, cb: () => unknown) => cb(),
      getOrganizationId: () => 'org-1',
    };

    const listener = new CollectionActivityListener(
      activityRepo as any,
      receivableRepo as any,
      tenantContext as any,
    );

    await listener.onDisputeResolved({
      disputeId: 'dis-1',
      receivableId: 'rec-1',
      organizationId: 'org-1',
    });

    expect(activityRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        activityType: CollectionActivityType.DISPUTE_RESOLVED,
        description: 'Đã giải quyết khiếu nại',
      }),
    );
  });

  it('writes an EMAIL_SENT row on reminder.sent', async () => {
    const activityRepo = {
      create: jest.fn(),
      findByReceivableId: jest.fn(),
      findByCustomerId: jest.fn(),
    };
    const receivableRepo = {
      findById: jest.fn().mockResolvedValue(buildReceivable()),
      findByIdForUpdate: jest.fn(),
      save: jest.fn(),
    };
    const tenantContext = {
      run: (_user: unknown, cb: () => unknown) => cb(),
      getOrganizationId: () => 'org-1',
    };

    const listener = new CollectionActivityListener(
      activityRepo as any,
      receivableRepo as any,
      tenantContext as any,
    );

    await listener.onReminderSent({
      reminderExecutionId: 'rem-1',
      receivableId: 'rec-1',
      organizationId: 'org-1',
    });

    expect(activityRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        activityType: CollectionActivityType.EMAIL_SENT,
        description: 'Đã gửi email nhắc thanh toán',
        metadata: { reminderExecutionId: 'rem-1' },
      }),
    );
  });

  it('writes an EMAIL_FAILED row on reminder.failed', async () => {
    const activityRepo = {
      create: jest.fn(),
      findByReceivableId: jest.fn(),
      findByCustomerId: jest.fn(),
    };
    const receivableRepo = {
      findById: jest.fn().mockResolvedValue(buildReceivable()),
      findByIdForUpdate: jest.fn(),
      save: jest.fn(),
    };
    const tenantContext = {
      run: (_user: unknown, cb: () => unknown) => cb(),
      getOrganizationId: () => 'org-1',
    };

    const listener = new CollectionActivityListener(
      activityRepo as any,
      receivableRepo as any,
      tenantContext as any,
    );

    await listener.onReminderFailed({
      reminderExecutionId: 'rem-2',
      receivableId: 'rec-1',
      organizationId: 'org-1',
    });

    expect(activityRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        activityType: CollectionActivityType.EMAIL_FAILED,
        description: 'Gửi email nhắc thanh toán thất bại',
        metadata: { reminderExecutionId: 'rem-2' },
      }),
    );
  });

  it('does not throw or reject when the activity repository write fails', async () => {
    const activityRepo = {
      create: jest.fn().mockRejectedValue(new Error('db unavailable')),
      findByReceivableId: jest.fn(),
      findByCustomerId: jest.fn(),
    };
    const receivableRepo = {
      findById: jest.fn(),
      findByIdForUpdate: jest.fn(),
      save: jest.fn(),
    };
    const tenantContext = {
      run: (_user: unknown, cb: () => unknown) => cb(),
      getOrganizationId: () => 'org-1',
    };

    const listener = new CollectionActivityListener(
      activityRepo as any,
      receivableRepo as any,
      tenantContext as any,
    );

    await expect(
      listener.onPaymentAllocated({
        paymentId: 'pay-1',
        receivableId: 'rec-1',
        customerId: 'cust-1',
        organizationId: 'org-1',
        amount: 30_000_000,
        allocatedByUserId: 'user-2',
      }),
    ).resolves.toBeUndefined();
  });

  it('does not throw or reject when resolveCustomerId fails to find the receivable', async () => {
    const activityRepo = {
      create: jest.fn(),
      findByReceivableId: jest.fn(),
      findByCustomerId: jest.fn(),
    };
    const receivableRepo = {
      findById: jest.fn().mockResolvedValue(null),
      findByIdForUpdate: jest.fn(),
      save: jest.fn(),
    };
    const tenantContext = {
      run: (_user: unknown, cb: () => unknown) => cb(),
      getOrganizationId: () => 'org-1',
    };

    const listener = new CollectionActivityListener(
      activityRepo as any,
      receivableRepo as any,
      tenantContext as any,
    );

    await expect(
      listener.onDisputeOpened({
        disputeId: 'dis-1',
        receivableId: 'rec-missing',
        organizationId: 'org-1',
      }),
    ).resolves.toBeUndefined();
    expect(activityRepo.create).not.toHaveBeenCalled();
  });
});
