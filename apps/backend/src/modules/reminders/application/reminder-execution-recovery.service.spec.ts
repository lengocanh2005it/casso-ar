import type { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import {
  ReminderExecution,
  ReminderExecutionStatus,
} from '../domain/reminder-execution';
import { ReminderExecutionRecoveryService } from './reminder-execution-recovery.service';
import type { IReminderExecutionRecoveryWorklist } from './reminder-execution-recovery-worklist.port';
import type { IReminderExecutionRepository } from './reminder-execution-repository.port';
import type { ReminderSenderService } from './reminder-sender.service';

function makeExecution(
  id: string,
  reminderRuleId: string | null = 'rule-1',
): ReminderExecution {
  return new ReminderExecution({
    id,
    organizationId: 'org-1',
    receivableId: `receivable-${id}`,
    reminderRuleId,
    minIntervalDays: reminderRuleId ? 7 : null,
    executionDate: new Date('2026-08-03T00:00:00.000Z'),
    sentAt: null,
    status: ReminderExecutionStatus.PENDING,
    skipReason: null,
    providerMessageId: null,
    failureReason: null,
    createdAt: new Date('2026-08-02T00:00:00.000Z'),
  });
}

describe('ReminderExecutionRecoveryService', () => {
  it('scans only worklisted organizations under owner tenant context with a one-minute cutoff and limit 100', async () => {
    const now = new Date('2026-08-03T12:34:56.000Z');
    const orgIds = ['org-1', 'org-2'];
    const worklist = {
      findOrganizationIdsWithStalePendingBefore: jest
        .fn()
        .mockResolvedValue(orgIds),
    };
    const executionRepo = {
      findPendingAutomatedBefore: jest.fn().mockResolvedValue([]),
    };
    const sender = { send: jest.fn() };
    const tenantContext = {
      run: jest.fn((_context, callback) => callback()),
    };
    const service = new ReminderExecutionRecoveryService(
      worklist as unknown as IReminderExecutionRecoveryWorklist,
      executionRepo as unknown as IReminderExecutionRepository,
      sender as unknown as ReminderSenderService,
      tenantContext as unknown as TenantContextService,
    );

    await service.recoverStalePending(now);

    const cutoff = new Date(now.getTime() - 60_000);
    expect(
      worklist.findOrganizationIdsWithStalePendingBefore,
    ).toHaveBeenCalledWith(cutoff);
    expect(tenantContext.run).toHaveBeenNthCalledWith(
      1,
      { userId: 'system', organizationId: 'org-1', role: Role.OWNER },
      expect.any(Function),
    );
    expect(tenantContext.run).toHaveBeenNthCalledWith(
      2,
      { userId: 'system', organizationId: 'org-2', role: Role.OWNER },
      expect.any(Function),
    );
    expect(executionRepo.findPendingAutomatedBefore).toHaveBeenNthCalledWith(
      1,
      cutoff,
      100,
    );
    expect(executionRepo.findPendingAutomatedBefore).toHaveBeenNthCalledWith(
      2,
      cutoff,
      100,
    );
  });

  it('does not query tenant executions when the worklist is empty', async () => {
    const worklist = {
      findOrganizationIdsWithStalePendingBefore: jest
        .fn()
        .mockResolvedValue([]),
    };
    const executionRepo = {
      findPendingAutomatedBefore: jest.fn(),
    };
    const tenantContext = { run: jest.fn() };
    const service = new ReminderExecutionRecoveryService(
      worklist as unknown as IReminderExecutionRecoveryWorklist,
      executionRepo as unknown as IReminderExecutionRepository,
      { send: jest.fn() } as unknown as ReminderSenderService,
      tenantContext as unknown as TenantContextService,
    );

    await service.recoverStalePending(new Date('2026-08-03T12:00:00.000Z'));

    expect(executionRepo.findPendingAutomatedBefore).not.toHaveBeenCalled();
    expect(tenantContext.run).not.toHaveBeenCalled();
  });

  it('recovers at most the 100 oldest rule-based executions returned for an organization', async () => {
    const executions = Array.from({ length: 103 }, (_, index) =>
      makeExecution(`exec-${index}`),
    );
    const executionRepo = {
      findPendingAutomatedBefore: jest.fn().mockResolvedValue(executions),
    };
    const sender = { send: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = {
      run: jest.fn((_context, callback) => callback()),
    };
    const service = new ReminderExecutionRecoveryService(
      {
        findOrganizationIdsWithStalePendingBefore: jest
          .fn()
          .mockResolvedValue(['org-1']),
      } as unknown as IReminderExecutionRecoveryWorklist,
      executionRepo as unknown as IReminderExecutionRepository,
      sender as unknown as ReminderSenderService,
      tenantContext as unknown as TenantContextService,
    );

    await service.recoverStalePending(new Date('2026-08-03T12:00:00.000Z'));

    expect(sender.send).toHaveBeenCalledTimes(100);
    expect(sender.send).toHaveBeenNthCalledWith(1, {
      organizationId: 'org-1',
      receivableId: 'receivable-exec-0',
      reminderRuleId: 'rule-1',
      executionDate: '2026-08-03',
    });
    expect(sender.send).toHaveBeenLastCalledWith({
      organizationId: 'org-1',
      receivableId: 'receivable-exec-99',
      reminderRuleId: 'rule-1',
      executionDate: '2026-08-03',
    });
  });

  it('does not send Copilot executions without a reminder rule', async () => {
    const executionRepo = {
      findPendingAutomatedBefore: jest
        .fn()
        .mockResolvedValue([makeExecution('copilot-exec', null)]),
    };
    const sender = { send: jest.fn() };
    const tenantContext = {
      run: jest.fn((_context, callback) => callback()),
    };
    const service = new ReminderExecutionRecoveryService(
      {
        findOrganizationIdsWithStalePendingBefore: jest
          .fn()
          .mockResolvedValue(['org-1']),
      } as unknown as IReminderExecutionRecoveryWorklist,
      executionRepo as unknown as IReminderExecutionRepository,
      sender as unknown as ReminderSenderService,
      tenantContext as unknown as TenantContextService,
    );

    await service.recoverStalePending(new Date('2026-08-03T12:00:00.000Z'));

    expect(sender.send).not.toHaveBeenCalled();
  });

  it('continues to the next execution when one sender call fails', async () => {
    const executionRepo = {
      findPendingAutomatedBefore: jest
        .fn()
        .mockResolvedValue([makeExecution('exec-1'), makeExecution('exec-2')]),
    };
    const sender = {
      send: jest
        .fn()
        .mockRejectedValueOnce(new Error('email queue unavailable'))
        .mockResolvedValueOnce(undefined),
    };
    const tenantContext = {
      run: jest.fn((_context, callback) => callback()),
    };
    const service = new ReminderExecutionRecoveryService(
      {
        findOrganizationIdsWithStalePendingBefore: jest
          .fn()
          .mockResolvedValue(['org-1']),
      } as unknown as IReminderExecutionRecoveryWorklist,
      executionRepo as unknown as IReminderExecutionRepository,
      sender as unknown as ReminderSenderService,
      tenantContext as unknown as TenantContextService,
    );

    await expect(
      service.recoverStalePending(new Date('2026-08-03T12:00:00.000Z')),
    ).resolves.toBeUndefined();
    expect(sender.send).toHaveBeenCalledTimes(2);
  });

  it('continues to the next organization when one organization scan fails', async () => {
    const executionRepo = {
      findPendingAutomatedBefore: jest
        .fn()
        .mockRejectedValueOnce(new Error('database unavailable'))
        .mockResolvedValueOnce([makeExecution('exec-2')]),
    };
    const sender = { send: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = {
      run: jest.fn((_context, callback) => callback()),
    };
    const service = new ReminderExecutionRecoveryService(
      {
        findOrganizationIdsWithStalePendingBefore: jest
          .fn()
          .mockResolvedValue(['org-1', 'org-2']),
      } as unknown as IReminderExecutionRecoveryWorklist,
      executionRepo as unknown as IReminderExecutionRepository,
      sender as unknown as ReminderSenderService,
      tenantContext as unknown as TenantContextService,
    );

    await service.recoverStalePending(new Date('2026-08-03T12:00:00.000Z'));

    expect(executionRepo.findPendingAutomatedBefore).toHaveBeenCalledTimes(2);
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(sender.send).toHaveBeenCalledWith({
      organizationId: 'org-2',
      receivableId: 'receivable-exec-2',
      reminderRuleId: 'rule-1',
      executionDate: '2026-08-03',
    });
  });
});
