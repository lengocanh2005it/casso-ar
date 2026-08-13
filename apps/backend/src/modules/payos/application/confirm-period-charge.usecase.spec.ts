import { PeriodChargeStatus, PlanId } from '@casso-ledger/shared-types';
import { DataSource } from 'typeorm';
import type { IAuditLogRepository } from '../../../common/audit/audit-log-repository.port';
import { PeriodCharge } from '../domain/period-charge';
import { ConfirmPeriodChargeUseCase } from './confirm-period-charge.usecase';
import type { IPeriodChargeRepository } from './period-charge-repository.port';

function buildCharge(status = PeriodChargeStatus.PENDING): PeriodCharge {
  return new PeriodCharge({
    id: 'charge-1',
    orderCode: 100_000_001,
    organizationId: 'org-1',
    planId: PlanId.STARTER,
    periodStart: new Date('2026-09-01T00:00:00Z'),
    periodEnd: new Date('2026-10-01T00:00:00Z'),
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('ConfirmPeriodChargeUseCase', () => {
  function buildDeps(existingCharge: PeriodCharge | null) {
    const chargeRepo: jest.Mocked<IPeriodChargeRepository> = {
      create: jest.fn(),
      lockAndFindByOrderCode: jest.fn().mockResolvedValue(existingCharge),
      save: jest.fn(),
      findLatestByOrganizationAndPeriodStart: jest.fn(),
    };
    const auditLogRepo: jest.Mocked<IAuditLogRepository> = {
      create: jest.fn(),
      findPage: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn((cb: (manager: unknown) => unknown) => cb({})),
    } as unknown as DataSource;
    const useCase = new ConfirmPeriodChargeUseCase(
      chargeRepo,
      auditLogRepo,
      dataSource,
    );
    return { useCase, chargeRepo, auditLogRepo };
  }

  it('on success, marks the charge PAID and writes an audit log', async () => {
    const { useCase, chargeRepo, auditLogRepo } = buildDeps(buildCharge());
    await useCase.execute({ orderCode: 100_000_001, paymentSucceeded: true });

    expect(chargeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: PeriodChargeStatus.PAID }),
      expect.anything(),
      'org-1',
    );
    expect(auditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'system' }),
      expect.anything(),
    );
  });

  it('on failure code, marks the charge FAILED', async () => {
    const { useCase, chargeRepo } = buildDeps(buildCharge());
    await useCase.execute({ orderCode: 100_000_001, paymentSucceeded: false });

    expect(chargeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: PeriodChargeStatus.FAILED }),
      expect.anything(),
      'org-1',
    );
  });

  it('is idempotent: a webhook replay for an already-terminal charge is a no-op', async () => {
    const { useCase, chargeRepo } = buildDeps(
      buildCharge(PeriodChargeStatus.PAID),
    );
    await useCase.execute({ orderCode: 100_000_001, paymentSucceeded: true });
    expect(chargeRepo.save).not.toHaveBeenCalled();
  });

  it('is a no-op when orderCode belongs to a different order type (not found)', async () => {
    const { useCase, chargeRepo } = buildDeps(null);
    await expect(
      useCase.execute({ orderCode: 5, paymentSucceeded: true }),
    ).resolves.toBeUndefined();
    expect(chargeRepo.save).not.toHaveBeenCalled();
  });
});
