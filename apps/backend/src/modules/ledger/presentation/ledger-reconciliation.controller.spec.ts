import { Permission } from '@casso-ar/shared-types';
import { REQUIRED_PERMISSION_KEY } from '../../../common/rbac/require-permission.decorator';
import { ArReconciliationFindingCode } from '../domain/ar-reconciliation';
import { LedgerEventSubjectType } from '../domain/ledger-event-subject-type';
import { LedgerReconciliationController } from './ledger-reconciliation.controller';

describe('LedgerReconciliationController', () => {
  it('requires RECEIVABLE_AUDIT_READ permission', () => {
    const requiredPermission = Reflect.getMetadata(
      REQUIRED_PERMISSION_KEY,
      LedgerReconciliationController.prototype.get,
    );

    expect(requiredPermission).toEqual(Permission.RECEIVABLE_AUDIT_READ);
  });

  it('maps the cursor to the use case and serializes the next cursor', async () => {
    const id = '10000000-0000-4000-8000-000000000001';
    const nextId = '20000000-0000-4000-8000-000000000001';
    const reconcile = {
      execute: jest.fn().mockResolvedValue({
        findings: [],
        nextCursor: {
          subjectType: LedgerEventSubjectType.PAYMENT,
          subjectId: nextId,
        },
        complete: false,
      }),
    };
    const controller = new LedgerReconciliationController(reconcile as never);

    await expect(
      controller.get({ cursor: `RECEIVABLE:${id}`, limit: 25 }),
    ).resolves.toEqual({
      findings: [],
      nextCursor: `PAYMENT:${nextId}`,
      complete: false,
    });
    expect(reconcile.execute).toHaveBeenCalledWith({
      cursor: {
        subjectType: LedgerEventSubjectType.RECEIVABLE,
        subjectId: id,
      },
      limit: 25,
    });
  });

  it('omits organizationId from findings returned to the client', async () => {
    const subjectId = '10000000-0000-4000-8000-000000000001';
    const reconcile = {
      execute: jest.fn().mockResolvedValue({
        findings: [
          {
            organizationId: 'private-organization-id',
            subjectType: LedgerEventSubjectType.RECEIVABLE,
            subjectId,
            code: ArReconciliationFindingCode.RECEIVABLE_ALLOCATION_MISMATCH,
            storedValue: 4,
            expectedValue: 3,
            delta: 1,
          },
        ],
        nextCursor: null,
        complete: true,
      }),
    };
    const controller = new LedgerReconciliationController(reconcile as never);

    await expect(controller.get({})).resolves.toEqual({
      findings: [
        {
          subjectType: LedgerEventSubjectType.RECEIVABLE,
          subjectId,
          code: ArReconciliationFindingCode.RECEIVABLE_ALLOCATION_MISMATCH,
          storedValue: 4,
          expectedValue: 3,
          delta: 1,
        },
      ],
      nextCursor: null,
      complete: true,
    });
  });
});
