import { ReceivableStatus } from '@casso-ledger/shared-types';
import { ErrorCode } from '../../../common/errors/error-code';
import { Membership, Role } from '../../organizations/domain/membership';
import { Receivable } from '../../receivables/domain/receivable';
import { CreateManualTaskUseCase } from './create-manual-task.usecase';

function buildReceivable(): Receivable {
  return new Receivable({
    id: 'rec-1',
    organizationId: 'org-1',
    customerId: 'customer-1',
    invoiceId: null,
    originalAmount: 50_000_000,
    paidAmount: 0,
    dueDate: new Date('2026-08-20'),
    status: ReceivableStatus.OPEN,
    salesRepresentativeId: 'user-1',
    createdAt: new Date('2026-07-20'),
    closedAt: null,
    version: 1,
  });
}

function buildMembership(userId: string): Membership {
  return new Membership({
    id: 'membership-1',
    organizationId: 'org-1',
    userId,
    role: Role.ACCOUNTANT,
    invitedAt: new Date('2026-01-01'),
    joinedAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
  });
}

function buildDeps() {
  return {
    internalTaskRepo: { save: jest.fn() },
    receivableRepo: {
      findById: jest.fn().mockResolvedValue(buildReceivable()),
    },
    membershipRepo: {
      findByUserAndOrganization: jest
        .fn()
        .mockResolvedValue(buildMembership('user-2')),
    },
    tenantContext: { getOrganizationId: jest.fn().mockReturnValue('org-1') },
    dataSource: { transaction: jest.fn(async (callback) => callback({})) },
  };
}

describe('CreateManualTaskUseCase', () => {
  it('creates a manual task for a member inside a transaction', async () => {
    const deps = buildDeps();
    const useCase = new CreateManualTaskUseCase(
      deps.internalTaskRepo as any,
      deps.receivableRepo as any,
      deps.membershipRepo as any,
      deps.tenantContext as any,
      deps.dataSource as any,
    );

    const task = await useCase.execute({
      receivableId: 'rec-1',
      assignedToUserId: 'user-2',
      title: 'Call customer',
      description: 'Customer promised to pay next week',
      createdByUserId: 'user-3',
    });

    expect(task.taskType).toBe('MANUAL');
    expect(task.status).toBe('OPEN');
    expect(task.assignedToUserId).toBe('user-2');
    expect(deps.dataSource.transaction).toHaveBeenCalled();
    expect(deps.internalTaskRepo.save).toHaveBeenCalledWith(
      task,
      expect.anything(),
    );
  });

  it('defaults and validates the creator as assignee', async () => {
    const deps = buildDeps();
    deps.membershipRepo.findByUserAndOrganization.mockResolvedValue(
      buildMembership('user-3'),
    );
    const useCase = new CreateManualTaskUseCase(
      deps.internalTaskRepo as any,
      deps.receivableRepo as any,
      deps.membershipRepo as any,
      deps.tenantContext as any,
      deps.dataSource as any,
    );

    const task = await useCase.execute({
      receivableId: 'rec-1',
      title: 'Call customer',
      description: null,
      createdByUserId: 'user-3',
    });

    expect(task.assignedToUserId).toBe('user-3');
    expect(deps.membershipRepo.findByUserAndOrganization).toHaveBeenCalledWith(
      'user-3',
      'org-1',
    );
  });

  it('rejects an assignee outside the organization', async () => {
    const deps = buildDeps();
    deps.membershipRepo.findByUserAndOrganization.mockResolvedValue(null);
    const useCase = new CreateManualTaskUseCase(
      deps.internalTaskRepo as any,
      deps.receivableRepo as any,
      deps.membershipRepo as any,
      deps.tenantContext as any,
      deps.dataSource as any,
    );

    await expect(
      useCase.execute({
        receivableId: 'rec-1',
        assignedToUserId: 'cross-tenant-user',
        title: 'Call customer',
        description: null,
        createdByUserId: 'user-3',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
    expect(deps.internalTaskRepo.save).not.toHaveBeenCalled();
  });
});
