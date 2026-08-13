import { RetentionSchedulerService } from './retention-scheduler.service';

function buildDeps() {
  return {
    auditLogRepo: { deleteOlderThan: jest.fn().mockResolvedValue(1) } as any,
    aiUsageLogRepo: { deleteOlderThan: jest.fn().mockResolvedValue(2) } as any,
    collectionActivityRepo: {
      deleteOlderThan: jest.fn().mockResolvedValue(3),
    } as any,
    reminderExecutionRepo: {
      deleteOlderThan: jest.fn().mockResolvedValue(4),
    } as any,
    webhookInboxRepo: {
      deleteOlderThan: jest.fn().mockResolvedValue(5),
    } as any,
    alertRepo: { deleteReadOlderThan: jest.fn().mockResolvedValue(6) } as any,
    idempotencyService: {
      deleteCompletedOlderThan: jest.fn().mockResolvedValue(7),
      sweepStalePending: jest.fn().mockResolvedValue(8),
    } as any,
  };
}

describe('RetentionSchedulerService.prune', () => {
  it('sweeps all 7 tables with their configured cutoffs', async () => {
    const deps = buildDeps();
    const service = new RetentionSchedulerService(
      deps.auditLogRepo,
      deps.aiUsageLogRepo,
      deps.collectionActivityRepo,
      deps.reminderExecutionRepo,
      deps.webhookInboxRepo,
      deps.alertRepo,
      deps.idempotencyService,
    );

    await service.prune();

    expect(deps.auditLogRepo.deleteOlderThan).toHaveBeenCalledWith(
      expect.any(Date),
    );
    expect(deps.aiUsageLogRepo.deleteOlderThan).toHaveBeenCalledWith(
      expect.any(Date),
    );
    expect(deps.collectionActivityRepo.deleteOlderThan).toHaveBeenCalledWith(
      expect.any(Date),
    );
    expect(deps.reminderExecutionRepo.deleteOlderThan).toHaveBeenCalledWith(
      expect.any(Date),
    );
    expect(deps.webhookInboxRepo.deleteOlderThan).toHaveBeenCalledWith(
      expect.any(Date),
    );
    expect(deps.alertRepo.deleteReadOlderThan).toHaveBeenCalledWith(
      expect.any(Date),
    );
    expect(
      deps.idempotencyService.deleteCompletedOlderThan,
    ).toHaveBeenCalledWith(expect.any(Date));
    expect(deps.idempotencyService.sweepStalePending).toHaveBeenCalledWith();
  });

  it('continues sweeping remaining tables when one table throws', async () => {
    const deps = buildDeps();
    deps.auditLogRepo.deleteOlderThan.mockRejectedValue(new Error('db down'));
    const service = new RetentionSchedulerService(
      deps.auditLogRepo,
      deps.aiUsageLogRepo,
      deps.collectionActivityRepo,
      deps.reminderExecutionRepo,
      deps.webhookInboxRepo,
      deps.alertRepo,
      deps.idempotencyService,
    );

    await service.prune();

    expect(deps.aiUsageLogRepo.deleteOlderThan).toHaveBeenCalled();
    expect(deps.webhookInboxRepo.deleteOlderThan).toHaveBeenCalled();
    expect(deps.idempotencyService.sweepStalePending).toHaveBeenCalled();
  });
});
