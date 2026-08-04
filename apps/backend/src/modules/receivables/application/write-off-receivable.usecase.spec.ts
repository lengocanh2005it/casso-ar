import { ReceivableStatus } from '@casso-ledger/shared-types';
import type { EntityManager } from 'typeorm';
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

    const useCase = new WriteOffReceivableUseCase(
      receivableRepo as any,
      dataSource as any,
    );
    const result = await useCase.execute('rec-1');

    expect(result.status).toBe(ReceivableStatus.WRITTEN_OFF);
    expect(receivableRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ReceivableStatus.WRITTEN_OFF }),
      manager,
    );
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
    const useCase = new WriteOffReceivableUseCase(
      receivableRepo as any,
      dataSource as any,
    );

    await expect(useCase.execute('missing')).rejects.toThrow(
      'Không tìm thấy khoản phải thu.',
    );
  });
});
