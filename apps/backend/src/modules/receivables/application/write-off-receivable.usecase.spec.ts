import { ReceivableStatus } from '@casso-ledger/shared-types';
import type { EntityManager } from 'typeorm';
import { Role } from '../../organizations/domain/membership';
import { BalanceHistoryActorType } from '../../receivable-balance-history/domain/balance-history-actor-type';
import { BalanceHistoryChangeSource } from '../../receivable-balance-history/domain/balance-history-change-source';
import { Receivable } from '../domain/receivable';
import { WriteOffReceivableUseCase } from './write-off-receivable.usecase';

describe('WriteOffReceivableUseCase', () => {
  it('writes off an OPEN receivable and persists it', async () => {
    const receivable = new Receivable({
      id: 'rec-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
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

    const receivableRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(receivable),
      save: jest.fn(),
    };
    const manager = {} as EntityManager;
    const dataSource = {
      transaction: jest.fn((callback: (m: EntityManager) => unknown) =>
        callback(manager),
      ),
    };
    const auditContext = { setBefore: jest.fn() };
    const eventPublisher = { emitAsync: jest.fn() };
    const recorder = { record: jest.fn() };
    const tenantContext = {
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: Role.OWNER,
      }),
    };

    const useCase = new WriteOffReceivableUseCase(
      receivableRepo as any,
      dataSource as any,
      auditContext as any,
      eventPublisher as any,
      recorder as any,
      tenantContext as any,
    );
    const result = await useCase.execute('rec-1');

    expect(result.status).toBe(ReceivableStatus.WRITTEN_OFF);
    expect(receivableRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ReceivableStatus.WRITTEN_OFF }),
      manager,
    );
    expect(auditContext.setBefore).toHaveBeenCalledWith(receivable);
    expect(eventPublisher.emitAsync).toHaveBeenCalledWith(
      'receivable.status-closed',
      { receivableId: 'rec-1', organizationId: 'org-1' },
    );
    expect(recorder.record).toHaveBeenCalledWith({
      receivable: expect.objectContaining({
        id: 'rec-1',
        status: ReceivableStatus.WRITTEN_OFF,
      }),
      changeSource: BalanceHistoryChangeSource.WRITE_OFF,
      provenance: {
        actorType: BalanceHistoryActorType.USER,
        actorUserId: 'user-1',
      },
      manager,
    });
  });

  it('throws if receivable not found', async () => {
    const receivableRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn((callback: (m: EntityManager) => unknown) =>
        callback({} as EntityManager),
      ),
    };
    const auditContext = { setBefore: jest.fn() };
    const eventPublisher = { emitAsync: jest.fn() };
    const recorder = { record: jest.fn() };
    const useCase = new WriteOffReceivableUseCase(
      receivableRepo as any,
      dataSource as any,
      auditContext as any,
      eventPublisher as any,
      recorder as any,
      { getCurrentUser: () => undefined } as any,
    );

    await expect(useCase.execute('missing')).rejects.toThrow(
      'Không tìm thấy khoản phải thu.',
    );
    expect(recorder.record).not.toHaveBeenCalled();
  });
});
