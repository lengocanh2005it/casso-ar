import { ReceivableStatus } from '@casso-ar/shared-types';
import { ErrorCode } from '../../../common/errors/error-code';
import { LedgerEventKind } from '../../ledger/domain/ledger-event-kind';
import { BalanceHistoryChangeSource } from '../../receivable-balance-history/domain/balance-history-change-source';
import { Receivable } from '../domain/receivable';
import { CancelReceivableUseCase } from './cancel-receivable.usecase';

function buildReceivable(
  paidAmount = 0,
  status = ReceivableStatus.OPEN,
): Receivable {
  return new Receivable({
    id: 'rec-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    invoiceId: null,
    originalAmount: 50_000_000,
    paidAmount,
    dueDate: new Date('2026-08-20'),
    status,
    salesRepresentativeId: 'user-1',
    createdAt: new Date('2026-07-20'),
    closedAt: null,
    version: 1,
  });
}

describe('CancelReceivableUseCase', () => {
  it('delegates the shared transition wiring to the transition runner with the CANCEL change source', async () => {
    const cancelled = buildReceivable(0, ReceivableStatus.CANCELLED);
    const transitionRunner = { run: jest.fn().mockResolvedValue(cancelled) };
    const useCase = new CancelReceivableUseCase(transitionRunner as any);

    const result = await useCase.execute('rec-1');

    expect(result).toBe(cancelled);
    expect(transitionRunner.run).toHaveBeenCalledWith({
      receivableId: 'rec-1',
      changeSource: BalanceHistoryChangeSource.CANCEL,
      ledgerKind: LedgerEventKind.RECEIVABLE_CANCELLED,
      assertTransitionAllowed: expect.any(Function),
      transition: expect.any(Function),
    });
  });

  it('assertTransitionAllowed rejects a receivable that has received a payment', async () => {
    const transitionRunner = { run: jest.fn().mockResolvedValue(undefined) };
    const useCase = new CancelReceivableUseCase(transitionRunner as any);
    await useCase.execute('rec-1');
    const input = transitionRunner.run.mock.calls[0][0];

    await expect(() =>
      input.assertTransitionAllowed(buildReceivable(10_000_000)),
    ).toThrow(
      expect.objectContaining({ errorCode: ErrorCode.RECEIVABLE_HAS_PAYMENTS }),
    );
  });

  it('assertTransitionAllowed lets an unpaid receivable through', async () => {
    const transitionRunner = { run: jest.fn().mockResolvedValue(undefined) };
    const useCase = new CancelReceivableUseCase(transitionRunner as any);
    await useCase.execute('rec-1');
    const input = transitionRunner.run.mock.calls[0][0];

    expect(() =>
      input.assertTransitionAllowed(buildReceivable()),
    ).not.toThrow();
  });

  it('transition cancels an OPEN receivable', async () => {
    const transitionRunner = { run: jest.fn().mockResolvedValue(undefined) };
    const useCase = new CancelReceivableUseCase(transitionRunner as any);
    await useCase.execute('rec-1');
    const input = transitionRunner.run.mock.calls[0][0];

    const result = input.transition(buildReceivable());

    expect(result.status).toBe(ReceivableStatus.CANCELLED);
  });

  it('transition maps a domain error to CONFLICT', async () => {
    const transitionRunner = { run: jest.fn().mockResolvedValue(undefined) };
    const useCase = new CancelReceivableUseCase(transitionRunner as any);
    await useCase.execute('rec-1');
    const input = transitionRunner.run.mock.calls[0][0];

    expect(() =>
      input.transition(buildReceivable(0, ReceivableStatus.WRITTEN_OFF)),
    ).toThrow(
      expect.objectContaining({
        errorCode: ErrorCode.CONFLICT,
        message: expect.stringContaining(
          'Cannot cancel a receivable in status',
        ),
      }),
    );
  });
});
