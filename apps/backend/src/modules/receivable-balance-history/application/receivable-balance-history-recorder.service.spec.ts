import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Receivable } from '../../receivables/domain/receivable';
import { BalanceHistoryChangeSource } from '../domain/balance-history-change-source';
import type { IReceivableBalanceHistoryRepository } from './receivable-balance-history.repository.port';
import { ReceivableBalanceHistoryRecorderService } from './receivable-balance-history-recorder.service';

function buildReceivable(
  overrides: Partial<ConstructorParameters<typeof Receivable>[0]> = {},
): Receivable {
  return new Receivable({
    id: 'rec-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    invoiceId: null,
    originalAmount: 10_000_000,
    paidAmount: 3_000_000,
    dueDate: new Date('2026-09-01'),
    status: ReceivableStatus.PARTIALLY_PAID,
    salesRepresentativeId: null,
    createdAt: new Date('2026-08-01'),
    closedAt: null,
    version: 1,
    ...overrides,
  });
}

describe('ReceivableBalanceHistoryRecorderService', () => {
  function buildService() {
    const appendMock = jest.fn().mockResolvedValue(undefined);
    const repo = {
      append: appendMock,
    } as never as IReceivableBalanceHistoryRepository;
    const service = new ReceivableBalanceHistoryRecorderService(repo);
    return { service, appendMock };
  }

  it('appends an entry for the post-transition receivable state', async () => {
    const { service, appendMock } = buildService();
    const receivable = buildReceivable({
      paidAmount: 10_000_000,
      status: ReceivableStatus.PAID,
      closedAt: new Date('2026-08-14'),
    });

    await service.record(
      receivable,
      BalanceHistoryChangeSource.ALLOCATE,
      undefined,
      'alloc-1',
    );

    expect(appendMock).toHaveBeenCalledTimes(1);
    const entry = appendMock.mock.calls[0]?.[0];
    expect(entry).toMatchObject({
      id: expect.any(String),
      organizationId: 'org-1',
      receivableId: 'rec-1',
      status: ReceivableStatus.PAID,
      remainingAmount: 0,
      changeSource: BalanceHistoryChangeSource.ALLOCATE,
      changeReason: 'alloc-1',
    });
    expect(entry.effectiveAt).toBeInstanceOf(Date);
    expect(entry.createdAt).toBeInstanceOf(Date);
  });

  it('records the remaining amount from the domain getter', async () => {
    const { service, appendMock } = buildService();

    await service.record(buildReceivable(), BalanceHistoryChangeSource.UNDO);

    expect(appendMock.mock.calls[0]?.[0].remainingAmount).toBe(7_000_000);
  });

  it('passes the transaction manager through to the repository', async () => {
    const { service, appendMock } = buildService();
    const manager = { transaction: jest.fn() };

    await service.record(
      buildReceivable(),
      BalanceHistoryChangeSource.CANCEL,
      manager as never,
    );

    expect(appendMock).toHaveBeenCalledWith(expect.anything(), manager);
  });

  it('defaults the change reason to null', async () => {
    const { service, appendMock } = buildService();

    await service.record(
      buildReceivable({ status: ReceivableStatus.CANCELLED }),
      BalanceHistoryChangeSource.CANCEL,
    );

    expect(appendMock.mock.calls[0]?.[0].changeReason).toBeNull();
  });
});
