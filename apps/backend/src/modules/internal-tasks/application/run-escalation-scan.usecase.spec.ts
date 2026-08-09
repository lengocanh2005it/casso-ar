import { ReceivableStatus } from '@casso-ledger/shared-types';
import type { Customer } from '../../customers/domain/customer';
import { CustomerGroup } from '../../customers/domain/customer-group';
import { Membership, Role } from '../../organizations/domain/membership';
import { Receivable } from '../../receivables/domain/receivable';
import { ReminderPolicy } from '../../reminders/domain/reminder-policy';
import { RunEscalationScanUseCase } from './run-escalation-scan.usecase';

function buildMembership(userId: string, role: Role): Membership {
  return new Membership({
    id: `membership-${userId}`,
    organizationId: 'org-1',
    userId,
    role,
    invitedAt: new Date('2026-01-01'),
    joinedAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
  });
}

function buildReceivable(overdueByDays: number, id = 'rec-1'): Receivable {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() - overdueByDays);
  return new Receivable({
    id,
    organizationId: 'org-1',
    customerId: 'customer-1',
    invoiceId: null,
    originalAmount: 50_000_000,
    paidAmount: 0,
    dueDate,
    status: ReceivableStatus.OPEN,
    salesRepresentativeId: 'user-1',
    createdAt: new Date('2026-01-01'),
    closedAt: null,
    version: 1,
  });
}

const customer: Customer = {
  id: 'customer-1',
  organizationId: 'org-1',
  name: 'Acme',
  taxCode: 'TAX-1',
  email: 'acme@example.com',
  phone: '0900000000',
  defaultPaymentTermDays: 30,
  creditLimit: 0,
  priority: 0,
  customerGroup: CustomerGroup.VIP,
  createdAt: new Date('2026-01-01'),
};

function buildDeps(overrides: Record<string, unknown> = {}) {
  return {
    membershipRepo: {
      findFirstByRole: jest
        .fn()
        .mockResolvedValue(
          buildMembership('finance-manager-1', Role.FINANCE_MANAGER),
        ),
      findOwnerByOrganization: jest
        .fn()
        .mockResolvedValue(buildMembership('owner-1', Role.OWNER)),
    },
    receivableRepo: {
      findOverdueByThreshold: jest
        .fn()
        .mockResolvedValue([buildReceivable(35)]),
    },
    customerRepo: {
      findByIds: jest
        .fn()
        .mockResolvedValue(new Map([[customer.id, customer]])),
    },
    reminderPolicyRepo: {
      findByCustomerGroup: jest.fn().mockResolvedValue(
        new ReminderPolicy({
          id: 'policy-1',
          organizationId: 'org-1',
          customerGroup: CustomerGroup.VIP,
          isActive: true,
          escalationThresholdDays: 30,
          createdAt: new Date('2026-01-01'),
        }),
      ),
    },
    internalTaskRepo: {
      createEscalationIfAbsent: jest.fn().mockResolvedValue(true),
    },
    dataSource: {
      transaction: jest.fn(async (callback) => callback({})),
    },
    tenantContext: { run: jest.fn((_context, callback) => callback()) },
    ...overrides,
  };
}

describe('RunEscalationScanUseCase', () => {
  it('creates an escalation task after the customer policy threshold', async () => {
    const deps = buildDeps();
    const useCase = new RunEscalationScanUseCase(
      deps.membershipRepo as any,
      deps.receivableRepo as any,
      deps.customerRepo as any,
      deps.reminderPolicyRepo as any,
      deps.internalTaskRepo as any,
      deps.tenantContext as any,
      deps.dataSource as any,
    );

    await useCase.scanOrganization('org-1');

    expect(deps.internalTaskRepo.createEscalationIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedToUserId: 'finance-manager-1',
        taskType: 'ESCALATION',
        status: 'OPEN',
      }),
      expect.anything(),
    );
  });

  it('uses the 30-day default when no active policy matches', async () => {
    const deps = buildDeps({
      reminderPolicyRepo: {
        findByCustomerGroup: jest.fn().mockResolvedValue(null),
      },
      receivableRepo: {
        findOverdueByThreshold: jest
          .fn()
          .mockResolvedValue([buildReceivable(25)]),
      },
    });
    const useCase = new RunEscalationScanUseCase(
      deps.membershipRepo as any,
      deps.receivableRepo as any,
      deps.customerRepo as any,
      deps.reminderPolicyRepo as any,
      deps.internalTaskRepo as any,
      deps.tenantContext as any,
      deps.dataSource as any,
    );

    await useCase.scanOrganization('org-1');

    expect(
      deps.internalTaskRepo.createEscalationIfAbsent,
    ).not.toHaveBeenCalled();
  });

  it('falls back to the owner when no finance manager exists', async () => {
    const deps = buildDeps({
      membershipRepo: {
        findFirstByRole: jest.fn().mockResolvedValue(null),
        findOwnerByOrganization: jest
          .fn()
          .mockResolvedValue(buildMembership('owner-1', Role.OWNER)),
      },
    });
    const useCase = new RunEscalationScanUseCase(
      deps.membershipRepo as any,
      deps.receivableRepo as any,
      deps.customerRepo as any,
      deps.reminderPolicyRepo as any,
      deps.internalTaskRepo as any,
      deps.tenantContext as any,
      deps.dataSource as any,
    );

    await useCase.scanOrganization('org-1');

    expect(deps.internalTaskRepo.createEscalationIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ assignedToUserId: 'owner-1' }),
      expect.anything(),
    );
  });

  it('pages through overdue receivables in batches instead of loading them all at once', async () => {
    const batchSize = 500;
    const firstBatch = Array.from({ length: batchSize }, (_, i) =>
      buildReceivable(35, `rec-${String(i).padStart(4, '0')}`),
    );
    const findOverdueByThreshold = jest
      .fn()
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce([]);
    const deps = buildDeps({
      receivableRepo: { findOverdueByThreshold },
    });
    const useCase = new RunEscalationScanUseCase(
      deps.membershipRepo as any,
      deps.receivableRepo as any,
      deps.customerRepo as any,
      deps.reminderPolicyRepo as any,
      deps.internalTaskRepo as any,
      deps.tenantContext as any,
      deps.dataSource as any,
    );

    await useCase.scanOrganization('org-1');

    expect(findOverdueByThreshold).toHaveBeenCalledTimes(2);
    expect(findOverdueByThreshold).toHaveBeenNthCalledWith(
      1,
      'org-1',
      1,
      null,
      batchSize,
    );
    expect(findOverdueByThreshold).toHaveBeenNthCalledWith(
      2,
      'org-1',
      1,
      firstBatch[firstBatch.length - 1].id,
      batchSize,
    );
    expect(
      deps.internalTaskRepo.createEscalationIfAbsent,
    ).toHaveBeenCalledTimes(batchSize);
  });
});
