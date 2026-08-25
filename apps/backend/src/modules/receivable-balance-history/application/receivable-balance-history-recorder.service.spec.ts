import { ReceivableStatus } from '@casso-ar/shared-types';
import { Receivable } from '../../receivables/domain/receivable';
import { BalanceHistoryActorType } from '../domain/balance-history-actor-type';
import { BalanceHistoryChangeSource } from '../domain/balance-history-change-source';
import { BalanceHistoryReasonCode } from '../domain/balance-history-reason-code';
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

    await service.record({
      receivable,
      changeSource: BalanceHistoryChangeSource.ALLOCATE,
      provenance: {
        actorType: BalanceHistoryActorType.USER,
        actorUserId: 'user-1',
      },
      transitionReferenceId: 'alloc-1',
    });

    expect(appendMock).toHaveBeenCalledTimes(1);
    const entry = appendMock.mock.calls[0]?.[0];
    expect(entry).toMatchObject({
      id: expect.any(String),
      organizationId: 'org-1',
      receivableId: 'rec-1',
      status: ReceivableStatus.PAID,
      remainingAmount: 0,
      changeSource: BalanceHistoryChangeSource.ALLOCATE,
      reasonCode: BalanceHistoryReasonCode.PAYMENT_ALLOCATED,
      actorType: BalanceHistoryActorType.USER,
      actorUserId: 'user-1',
      transitionReferenceId: 'alloc-1',
    });
    expect(entry.effectiveAt).toBeInstanceOf(Date);
    expect(entry.createdAt).toBeInstanceOf(Date);
  });

  it('records the remaining amount from the domain getter', async () => {
    const { service, appendMock } = buildService();

    await service.record({
      receivable: buildReceivable(),
      changeSource: BalanceHistoryChangeSource.UNDO,
      provenance: {
        actorType: BalanceHistoryActorType.WEBHOOK,
        actorUserId: null,
      },
    });

    expect(appendMock.mock.calls[0]?.[0].remainingAmount).toBe(7_000_000);
  });

  it('passes the transaction manager through to the repository', async () => {
    const { service, appendMock } = buildService();
    const manager = { transaction: jest.fn() };

    await service.record({
      receivable: buildReceivable(),
      changeSource: BalanceHistoryChangeSource.CANCEL,
      provenance: {
        actorType: BalanceHistoryActorType.SYSTEM,
        actorUserId: null,
      },
      manager: manager as never,
    });

    expect(appendMock).toHaveBeenCalledWith(expect.anything(), manager);
  });

  it.each([
    [
      BalanceHistoryChangeSource.CREATE,
      BalanceHistoryReasonCode.RECEIVABLE_CREATED,
    ],
    [
      BalanceHistoryChangeSource.ALLOCATE,
      BalanceHistoryReasonCode.PAYMENT_ALLOCATED,
    ],
    [
      BalanceHistoryChangeSource.UNDO,
      BalanceHistoryReasonCode.PAYMENT_ALLOCATION_UNDONE,
    ],
    [
      BalanceHistoryChangeSource.CANCEL,
      BalanceHistoryReasonCode.RECEIVABLE_CANCELLED,
    ],
    [
      BalanceHistoryChangeSource.WRITE_OFF,
      BalanceHistoryReasonCode.RECEIVABLE_WRITTEN_OFF,
    ],
    [
      BalanceHistoryChangeSource.ROLLOUT_BASELINE,
      BalanceHistoryReasonCode.ROLLOUT_BASELINE,
    ],
  ])(
    'derives the reason code %s from the change source %s',
    async (changeSource, reasonCode) => {
      const { service, appendMock } = buildService();

      await service.record({
        receivable: buildReceivable(),
        changeSource,
        provenance: {
          actorType: BalanceHistoryActorType.USER,
          actorUserId: 'user-1',
        },
      });

      expect(appendMock.mock.calls[0]?.[0].reasonCode).toBe(reasonCode);
    },
  );

  it('rejects USER provenance without an actor user id', async () => {
    const { service } = buildService();

    await expect(
      service.record({
        receivable: buildReceivable(),
        changeSource: BalanceHistoryChangeSource.CANCEL,
        provenance: {
          actorType: BalanceHistoryActorType.USER,
          actorUserId: null,
        },
      }),
    ).rejects.toThrow('USER');
  });

  it('rejects WEBHOOK provenance carrying an actor user id', async () => {
    const { service } = buildService();

    await expect(
      service.record({
        receivable: buildReceivable(),
        changeSource: BalanceHistoryChangeSource.ALLOCATE,
        provenance: {
          actorType: BalanceHistoryActorType.WEBHOOK,
          actorUserId: 'user-1',
        },
      }),
    ).rejects.toThrow('WEBHOOK');
  });

  it('rejects SYSTEM provenance carrying an actor user id', async () => {
    const { service } = buildService();

    await expect(
      service.record({
        receivable: buildReceivable(),
        changeSource: BalanceHistoryChangeSource.ROLLOUT_BASELINE,
        provenance: {
          actorType: BalanceHistoryActorType.SYSTEM,
          actorUserId: 'user-1',
        },
      }),
    ).rejects.toThrow('SYSTEM');
  });

  it('persists the note and transition reference on the appended entry', async () => {
    const { service, appendMock } = buildService();

    await service.record({
      receivable: buildReceivable(),
      changeSource: BalanceHistoryChangeSource.UNDO,
      provenance: {
        actorType: BalanceHistoryActorType.USER,
        actorUserId: 'user-1',
      },
      note: 'Nhập sai số tiền',
      transitionReferenceId: 'alloc-1',
    });

    const entry = appendMock.mock.calls[0]?.[0];
    expect(entry.note).toBe('Nhập sai số tiền');
    expect(entry.transitionReferenceId).toBe('alloc-1');
  });
});
