import { ArReconciliationFindingCode } from '../domain/ar-reconciliation';
import { LedgerEventSubjectType } from '../domain/ledger-event-subject-type';
import { ReconcileArBalancesUseCase } from './reconcile-ar-balances.usecase';

describe('ReconcileArBalancesUseCase', () => {
  it('returns no findings for matching balances in the current tenant', async () => {
    const query = {
      listPage: jest.fn().mockResolvedValue({
        subjects: [
          {
            organizationId: 'org-current',
            subjectType: LedgerEventSubjectType.RECEIVABLE,
            subjectId: '10000000-0000-4000-8000-000000000001',
            storedRollupAmount: 100,
            currentBalance: 400,
            activeAllocationAmount: 100,
            ledgerMovementAmount: 400,
            hasRolloutBaseline: true,
            hasOpeningEvent: false,
          },
          {
            organizationId: 'org-current',
            subjectType: LedgerEventSubjectType.PAYMENT,
            subjectId: '20000000-0000-4000-8000-000000000001',
            storedRollupAmount: 100,
            currentBalance: 400,
            activeAllocationAmount: 100,
            ledgerMovementAmount: 400,
            hasRolloutBaseline: true,
            hasOpeningEvent: false,
          },
        ],
        nextCursor: null,
      }),
    };
    const tenantContext = { getOrganizationId: () => 'org-current' };
    const useCase = new ReconcileArBalancesUseCase(
      query as never,
      tenantContext as never,
    );

    await expect(useCase.execute({})).resolves.toEqual({
      findings: [],
      nextCursor: null,
      complete: true,
    });
    expect(query.listPage).toHaveBeenCalledWith('org-current', null, 20);
  });

  it('reports a receivable paid rollup that differs from active allocations', async () => {
    const query = {
      listPage: jest.fn().mockResolvedValue({
        subjects: [
          {
            organizationId: 'org-current',
            subjectType: LedgerEventSubjectType.RECEIVABLE,
            subjectId: '10000000-0000-4000-8000-000000000002',
            storedRollupAmount: 250,
            currentBalance: 750,
            activeAllocationAmount: 200,
            ledgerMovementAmount: 750,
            hasRolloutBaseline: true,
            hasOpeningEvent: false,
          },
        ],
        nextCursor: null,
      }),
    };
    const useCase = new ReconcileArBalancesUseCase(
      query as never,
      { getOrganizationId: () => 'org-current' } as never,
    );

    await expect(useCase.execute({})).resolves.toMatchObject({
      findings: [
        {
          organizationId: 'org-current',
          subjectType: LedgerEventSubjectType.RECEIVABLE,
          subjectId: '10000000-0000-4000-8000-000000000002',
          code: ArReconciliationFindingCode.RECEIVABLE_ALLOCATION_MISMATCH,
          storedValue: 250,
          expectedValue: 200,
          delta: 50,
        },
      ],
    });
  });

  it('reports payment credit that differs from its ledger movement total', async () => {
    const query = {
      listPage: jest.fn().mockResolvedValue({
        subjects: [
          {
            organizationId: 'org-current',
            subjectType: LedgerEventSubjectType.PAYMENT,
            subjectId: '20000000-0000-4000-8000-000000000002',
            storedRollupAmount: 100,
            currentBalance: 850,
            activeAllocationAmount: 100,
            ledgerMovementAmount: 900,
            hasRolloutBaseline: true,
            hasOpeningEvent: false,
          },
        ],
        nextCursor: null,
      }),
    };
    const useCase = new ReconcileArBalancesUseCase(
      query as never,
      { getOrganizationId: () => 'org-current' } as never,
    );

    await expect(useCase.execute({})).resolves.toMatchObject({
      findings: [
        {
          code: ArReconciliationFindingCode.PAYMENT_LEDGER_MISMATCH,
          storedValue: 850,
          expectedValue: 900,
          delta: -50,
        },
      ],
    });
  });

  it('marks nonzero balance history incomplete when it has no baseline or opening event', async () => {
    const query = {
      listPage: jest.fn().mockResolvedValue({
        subjects: [
          {
            organizationId: 'org-current',
            subjectType: LedgerEventSubjectType.RECEIVABLE,
            subjectId: '10000000-0000-4000-8000-000000000003',
            storedRollupAmount: 0,
            currentBalance: 500,
            activeAllocationAmount: 0,
            ledgerMovementAmount: 0,
            hasRolloutBaseline: false,
            hasOpeningEvent: false,
          },
          {
            organizationId: 'org-current',
            subjectType: LedgerEventSubjectType.PAYMENT,
            subjectId: '20000000-0000-4000-8000-000000000003',
            storedRollupAmount: 0,
            currentBalance: 0,
            activeAllocationAmount: 0,
            ledgerMovementAmount: 0,
            hasRolloutBaseline: false,
            hasOpeningEvent: false,
          },
        ],
        nextCursor: null,
      }),
    };
    const useCase = new ReconcileArBalancesUseCase(
      query as never,
      { getOrganizationId: () => 'org-current' } as never,
    );

    await expect(useCase.execute({})).resolves.toMatchObject({
      findings: [
        {
          code: ArReconciliationFindingCode.LEDGER_BASELINE_MISSING,
          storedValue: 500,
          expectedValue: null,
          delta: null,
        },
      ],
    });
  });

  it('caps each page at 100 subjects and preserves the continuation cursor', async () => {
    const cursor = {
      subjectType: LedgerEventSubjectType.RECEIVABLE,
      subjectId: '10000000-0000-4000-8000-000000000004',
    };
    const nextCursor = {
      subjectType: LedgerEventSubjectType.PAYMENT,
      subjectId: '20000000-0000-4000-8000-000000000004',
    };
    const query = {
      listPage: jest.fn().mockResolvedValue({ subjects: [], nextCursor }),
    };
    const useCase = new ReconcileArBalancesUseCase(
      query as never,
      { getOrganizationId: () => 'org-current' } as never,
    );

    await expect(useCase.execute({ cursor, limit: 500 })).resolves.toEqual({
      findings: [],
      nextCursor,
      complete: false,
    });
    expect(query.listPage).toHaveBeenCalledWith('org-current', cursor, 100);
  });
});
