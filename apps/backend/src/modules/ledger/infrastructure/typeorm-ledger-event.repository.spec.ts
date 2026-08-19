import { Test } from '@nestjs/testing';
import { AppError } from '../../../common/errors/app-error';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { LedgerEventKind } from '../domain/ledger-event-kind';
import { LedgerEventSubjectType } from '../domain/ledger-event-subject-type';
import { TypeOrmLedgerEventRepository } from './typeorm-ledger-event.repository';

describe('TypeOrmLedgerEventRepository', () => {
  it('rejects an entry whose organizationId does not match the tenant context', async () => {
    const ormRepo = { insert: jest.fn() };
    const tenantContext = {
      getOrganizationId: () => 'org-current',
    } as unknown as TenantContextService;
    const repo = new TypeOrmLedgerEventRepository(
      ormRepo as never,
      tenantContext,
    );

    await expect(
      repo.append({
        id: 'evt-1',
        organizationId: 'org-other',
        subjectType: LedgerEventSubjectType.RECEIVABLE,
        subjectId: 'r-1',
        kind: LedgerEventKind.RECEIVABLE_CREATED,
        amount: 100,
        effectiveAt: new Date(),
        transitionReferenceId: null,
        createdAt: new Date(),
      }),
    ).rejects.toThrow(AppError);
    expect(ormRepo.insert).not.toHaveBeenCalled();
  });

  it('inserts (never updates) a valid entry', async () => {
    const ormRepo = { insert: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = {
      getOrganizationId: () => 'org-current',
    } as unknown as TenantContextService;
    const repo = new TypeOrmLedgerEventRepository(
      ormRepo as never,
      tenantContext,
    );

    await repo.append({
      id: 'evt-1',
      organizationId: 'org-current',
      subjectType: LedgerEventSubjectType.PAYMENT,
      subjectId: 'p-1',
      kind: LedgerEventKind.PAYMENT_RECEIVED,
      amount: 500_000,
      effectiveAt: new Date(),
      transitionReferenceId: null,
      createdAt: new Date(),
    });

    expect(ormRepo.insert).toHaveBeenCalledTimes(1);
  });
});
