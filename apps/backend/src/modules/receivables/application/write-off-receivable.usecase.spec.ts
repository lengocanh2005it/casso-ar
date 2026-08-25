import { ReceivableStatus } from '@casso-ar/shared-types';
import { LedgerEventKind } from '../../ledger/domain/ledger-event-kind';
import { BalanceHistoryChangeSource } from '../../receivable-balance-history/domain/balance-history-change-source';
import { Receivable } from '../domain/receivable';
import { WriteOffReceivableUseCase } from './write-off-receivable.usecase';

function buildReceivable(status = ReceivableStatus.OPEN): Receivable {
  return new Receivable({
    id: 'rec-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    invoiceId: null,
    originalAmount: 50_000_000,
    paidAmount: 0,
    dueDate: new Date('2026-08-20'),
    status,
    salesRepresentativeId: 'user-1',
    createdAt: new Date('2026-07-20'),
    closedAt: null,
    version: 1,
  });
}

describe('WriteOffReceivableUseCase', () => {
  it('delegates the shared transition wiring to the transition runner with the WRITE_OFF change source', async () => {
    const writtenOff = buildReceivable(ReceivableStatus.WRITTEN_OFF);
    const transitionRunner = { run: jest.fn().mockResolvedValue(writtenOff) };
    const useCase = new WriteOffReceivableUseCase(transitionRunner as any);

    const result = await useCase.execute('rec-1');

    expect(result).toBe(writtenOff);
    expect(transitionRunner.run).toHaveBeenCalledWith({
      receivableId: 'rec-1',
      changeSource: BalanceHistoryChangeSource.WRITE_OFF,
      ledgerKind: LedgerEventKind.RECEIVABLE_WRITTEN_OFF,
      transition: expect.any(Function),
    });
  });

  it('transition writes off an OPEN receivable', async () => {
    const transitionRunner = { run: jest.fn().mockResolvedValue(undefined) };
    const useCase = new WriteOffReceivableUseCase(transitionRunner as any);
    await useCase.execute('rec-1');
    const input = transitionRunner.run.mock.calls[0][0];

    const result = input.transition(buildReceivable());

    expect(result.status).toBe(ReceivableStatus.WRITTEN_OFF);
  });

  it('transition lets a non-OPEN domain error propagate raw (no cancel-style mapping)', async () => {
    const transitionRunner = { run: jest.fn().mockResolvedValue(undefined) };
    const useCase = new WriteOffReceivableUseCase(transitionRunner as any);
    await useCase.execute('rec-1');
    const input = transitionRunner.run.mock.calls[0][0];

    expect(() =>
      input.transition(buildReceivable(ReceivableStatus.WRITTEN_OFF)),
    ).toThrow(/Cannot write off a receivable in status/);
  });
});
