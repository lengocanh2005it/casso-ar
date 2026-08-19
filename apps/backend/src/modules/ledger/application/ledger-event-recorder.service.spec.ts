import { LedgerEventKind } from '../domain/ledger-event-kind';
import { LedgerEventSubjectType } from '../domain/ledger-event-subject-type';
import { LedgerEventRecorderService } from './ledger-event-recorder.service';
import type { ILedgerEventRepository } from './ledger-event-repository.port';

describe('LedgerEventRecorderService', () => {
  it('appends a valid ledger event with a generated id and timestamps', async () => {
    const repo: ILedgerEventRepository = { append: jest.fn() };
    const service = new LedgerEventRecorderService(repo);

    await service.record({
      organizationId: 'org-1',
      subjectType: LedgerEventSubjectType.RECEIVABLE,
      subjectId: 'r-1',
      kind: LedgerEventKind.RECEIVABLE_CREATED,
      amount: 500_000,
    });

    expect(repo.append).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        subjectType: LedgerEventSubjectType.RECEIVABLE,
        subjectId: 'r-1',
        kind: LedgerEventKind.RECEIVABLE_CREATED,
        amount: 500_000,
        transitionReferenceId: null,
      }),
      undefined,
    );
  });

  it('rejects a zero amount before reaching the repository', async () => {
    const repo: ILedgerEventRepository = { append: jest.fn() };
    const service = new LedgerEventRecorderService(repo);

    await expect(
      service.record({
        organizationId: 'org-1',
        subjectType: LedgerEventSubjectType.PAYMENT,
        subjectId: 'p-1',
        kind: LedgerEventKind.PAYMENT_RECEIVED,
        amount: 0,
      }),
    ).rejects.toThrow('Ledger event amount must not be zero');
    expect(repo.append).not.toHaveBeenCalled();
  });
});
