import { ReceivableStatus } from '@casso-ar/shared-types';
import { AppError } from '../../../../common/errors/app-error';
import { ErrorCode } from '../../../../common/errors/error-code';
import { TenantContextService } from '../../../../common/tenancy/tenant-context';
import { Role } from '../../../organizations/domain/membership';
import { Receivable } from '../../../receivables/domain/receivable';
import { FindOverdueReceivablesTool } from './find-overdue-receivables.tool';
import { GetCollectionActivityTimelineTool } from './get-collection-activity-timeline.tool';
import { GetPaymentHistoryTool } from './get-payment-history.tool';
import { GetReceivableSummaryTool } from './get-receivable-summary.tool';

function receivable(overrides: {
  originalAmount: number;
  paidAmount: number;
  dueDate: Date;
}): Receivable {
  return new Receivable({
    id: 'rec-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    invoiceId: null,
    status: ReceivableStatus.OPEN,
    salesRepresentativeId: 'user-1',
    createdAt: new Date('2026-01-01'),
    closedAt: null,
    version: 1,
    ...overrides,
  });
}

describe('Copilot read tools', () => {
  it('computes the canonical receivable summary from open receivables', async () => {
    const today = new Date('2026-08-03');
    const receivables = [
      receivable({
        originalAmount: 10_000_000,
        paidAmount: 0,
        dueDate: new Date('2026-07-24'),
      }),
      receivable({
        originalAmount: 20_000_000,
        paidAmount: 5_000_000,
        dueDate: new Date('2026-07-04'),
      }),
      receivable({
        originalAmount: 5_000_000,
        paidAmount: 0,
        dueDate: new Date('2026-09-01'),
      }),
    ];
    const receivableRepo = {
      findOpenByCustomerId: jest.fn().mockResolvedValue(receivables),
    };

    const tool = new GetReceivableSummaryTool(receivableRepo as any);
    const result = await tool.execute({ customerId: 'cust-1' }, today);

    expect(receivableRepo.findOpenByCustomerId).toHaveBeenCalledWith('cust-1');
    expect(result).toEqual({
      customerId: 'cust-1',
      totalOutstanding: 30_000_000,
      totalOverdue: 25_000_000,
      overdueCount: 2,
      maxOverdueDays: 30,
      averageLateDays: 20,
    });
  });

  it('delegates the collection timeline with a bounded limit', async () => {
    const timelineUseCase = {
      execute: jest
        .fn()
        .mockResolvedValue({ items: [{ id: 'activity-1' }], total: 1 }),
    };
    const tool = new GetCollectionActivityTimelineTool(timelineUseCase as any);

    await expect(
      tool.execute({ customerId: 'cust-1', limit: 50 }),
    ).resolves.toEqual({
      customerId: 'cust-1',
      items: [{ id: 'activity-1' }],
    });
    expect(timelineUseCase.execute).toHaveBeenCalledWith('cust-1', 1, 50);
  });

  it('delegates payment history with a bounded limit', async () => {
    const allocationRepo = {
      findByCustomerId: jest.fn().mockResolvedValue([{ id: 'allocation-1' }]),
    };
    const tool = new GetPaymentHistoryTool(allocationRepo as any);

    await expect(
      tool.execute({ customerId: 'cust-1', limit: 50 }),
    ).resolves.toEqual({
      customerId: 'cust-1',
      items: [{ id: 'allocation-1' }],
    });
    expect(allocationRepo.findByCustomerId).toHaveBeenCalledWith('cust-1', 50);
  });

  it('clamps bounded tool limits to the inclusive range 1 through 50', async () => {
    const timelineUseCase = {
      execute: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const tool = new GetCollectionActivityTimelineTool(timelineUseCase as any);

    await tool.execute({ customerId: 'cust-1', limit: 500 });
    await tool.execute({ customerId: 'cust-1', limit: 0 });
    await tool.execute({ customerId: 'cust-1' });

    expect(timelineUseCase.execute).toHaveBeenNthCalledWith(1, 'cust-1', 1, 50);
    expect(timelineUseCase.execute).toHaveBeenNthCalledWith(2, 'cust-1', 1, 1);
    expect(timelineUseCase.execute).toHaveBeenNthCalledWith(3, 'cust-1', 1, 20);
  });

  describe('FindOverdueReceivablesTool', () => {
    const fixedNow = new Date('2026-08-23T12:00:00.000Z');

    const rec1 = new Receivable({
      id: 'rec-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      invoiceId: 'inv-1',
      originalAmount: 10_000_000,
      paidAmount: 2_000_000,
      dueDate: new Date('2026-08-01T00:00:00.000Z'),
      status: ReceivableStatus.PARTIALLY_PAID,
      salesRepresentativeId: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      closedAt: null,
      version: 1,
    });

    const rec2 = new Receivable({
      id: 'rec-2',
      organizationId: 'org-1',
      customerId: 'cust-2',
      invoiceId: null,
      originalAmount: 5_000_000,
      paidAmount: 0,
      dueDate: new Date('2026-08-10T00:00:00.000Z'),
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: null,
      createdAt: new Date('2026-07-10T00:00:00.000Z'),
      closedAt: null,
      version: 1,
    });

    it('returns overdue candidates with remaining amounts, ISO due dates, customer names, and invoice numbers (or null)', async () => {
      const receivableRepo = {
        findOverdueCandidates: jest.fn().mockResolvedValue([rec1, rec2]),
      };
      const customerRepo = {
        findIdsBySearch: jest.fn(),
        findByIds: jest.fn().mockResolvedValue(
          new Map([
            ['cust-1', { id: 'cust-1', name: 'Công ty Alpha' }],
            ['cust-2', { id: 'cust-2', name: 'Công ty Beta' }],
          ]),
        ),
      };
      const invoiceRepo = {
        findIdsByInvoiceNumberSearch: jest.fn(),
        findByIds: jest
          .fn()
          .mockResolvedValue(
            new Map([['inv-1', { id: 'inv-1', invoiceNumber: 'INV-001' }]]),
          ),
      };
      const tenantContext = new TenantContextService();

      const tool = new FindOverdueReceivablesTool(
        receivableRepo as any,
        customerRepo as any,
        invoiceRepo as any,
        tenantContext,
      );

      const result = await tenantContext.run(
        { userId: 'u-1', organizationId: 'org-1', role: Role.FINANCE_MANAGER },
        () => tool.execute({}, fixedNow),
      );

      expect(result).toEqual({
        items: [
          {
            receivableId: 'rec-1',
            customerId: 'cust-1',
            customerName: 'Công ty Alpha',
            invoiceNumber: 'INV-001',
            remainingAmount: 8_000_000,
            dueDate: '2026-08-01T00:00:00.000Z',
          },
          {
            receivableId: 'rec-2',
            customerId: 'cust-2',
            customerName: 'Công ty Beta',
            invoiceNumber: null,
            remainingAmount: 5_000_000,
            dueDate: '2026-08-10T00:00:00.000Z',
          },
        ],
        hasMore: false,
        nextCursor: null,
      });

      expect(receivableRepo.findOverdueCandidates).toHaveBeenCalledWith({
        organizationId: 'org-1',
        referenceDate: fixedNow,
        salesRepresentativeId: undefined,
        customerIdIn: undefined,
        invoiceIdIn: undefined,
        after: undefined,
        sortBy: 'due_date_asc',
        limit: 11,
      });
      expect(customerRepo.findByIds).toHaveBeenCalledWith(['cust-1', 'cust-2']);
      expect(invoiceRepo.findByIds).toHaveBeenCalledWith(['inv-1']);
    });

    it('asks the repository for the largest debt first when the model wants a ranking', async () => {
      // Sorting was hardcoded to dueDate ASC, so "ai nợ nhiều nhất" only
      // returned the truth by coincidence in seed data. Once a customer had
      // many overdue rows the model would answer from the wrong page.
      const receivableRepo = {
        findOverdueCandidates: jest.fn().mockResolvedValue([rec1]),
      };
      const customerRepo = {
        findByIds: jest
          .fn()
          .mockResolvedValue(
            new Map([['cust-1', { id: 'cust-1', name: 'Công ty Alpha' }]]),
          ),
      };
      const invoiceRepo = {
        findByIds: jest
          .fn()
          .mockResolvedValue(
            new Map([['inv-1', { id: 'inv-1', invoiceNumber: 'INV-001' }]]),
          ),
      };
      const tenantContext = new TenantContextService();
      const tool = new FindOverdueReceivablesTool(
        receivableRepo as any,
        customerRepo as any,
        invoiceRepo as any,
        tenantContext,
      );

      await tenantContext.run(
        { userId: 'u-1', organizationId: 'org-1', role: Role.FINANCE_MANAGER },
        () => tool.execute({ sortBy: 'amount_desc' }, fixedNow),
      );

      expect(receivableRepo.findOverdueCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: 'amount_desc' }),
      );
    });

    it('defaults to the earliest due date so paging keeps working', async () => {
      const receivableRepo = {
        findOverdueCandidates: jest.fn().mockResolvedValue([]),
      };
      const tenantContext = new TenantContextService();
      const tool = new FindOverdueReceivablesTool(
        receivableRepo as any,
        {} as any,
        {} as any,
        tenantContext,
      );

      await tenantContext.run(
        { userId: 'u-1', organizationId: 'org-1', role: Role.FINANCE_MANAGER },
        () => tool.execute({}, fixedNow),
      );

      expect(receivableRepo.findOverdueCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: 'due_date_asc' }),
      );
    });

    it('forces the due-date ordering when a cursor is present', async () => {
      // The cursor is a keyset on (dueDate, id); combining it with an
      // amount ordering would slice the wrong window on "xem tiếp".
      const receivableRepo = {
        findOverdueCandidates: jest.fn().mockResolvedValue([]),
      };
      const tenantContext = new TenantContextService();
      const tool = new FindOverdueReceivablesTool(
        receivableRepo as any,
        {} as any,
        {} as any,
        tenantContext,
      );

      await tenantContext.run(
        { userId: 'u-1', organizationId: 'org-1', role: Role.FINANCE_MANAGER },
        () =>
          tool.execute(
            {
              sortBy: 'amount_desc',
              cursor: {
                dueDate: fixedNow.toISOString(),
                receivableId: 'rec-1',
              },
            },
            fixedNow,
          ),
      );

      expect(receivableRepo.findOverdueCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: 'due_date_asc' }),
      );
    });

    it('never advertises more results on a ranking page', async () => {
      // A ranking page has no (dueDate, id) cursor, so saying "xem tiếp"
      // would drop the user into an unrelated due-date page.
      const candidates = Array.from(
        { length: 11 },
        (_, index) =>
          new Receivable({
            ...rec1,
            id: `rec-${index + 1}`,
            dueDate: new Date(Date.UTC(2026, 7, index + 1)),
          }),
      );
      const receivableRepo = {
        findOverdueCandidates: jest.fn().mockResolvedValue(candidates),
      };
      const customerRepo = {
        findByIds: jest
          .fn()
          .mockResolvedValue(
            new Map([['cust-1', { id: 'cust-1', name: 'Công ty Alpha' }]]),
          ),
      };
      const invoiceRepo = {
        findByIds: jest
          .fn()
          .mockResolvedValue(
            new Map([['inv-1', { id: 'inv-1', invoiceNumber: 'INV-001' }]]),
          ),
      };
      const tenantContext = new TenantContextService();
      const tool = new FindOverdueReceivablesTool(
        receivableRepo as any,
        customerRepo as any,
        invoiceRepo as any,
        tenantContext,
      );

      const result = await tenantContext.run(
        { userId: 'u-1', organizationId: 'org-1', role: Role.FINANCE_MANAGER },
        () => tool.execute({ sortBy: 'amount_desc' }, fixedNow),
      );

      expect(result.items).toHaveLength(10);
      expect(result).toMatchObject({ hasMore: false, nextCursor: null });
    });

    it('returns only 10 overdue receivables and a cursor from the 10th when more exist', async () => {
      const candidates = Array.from(
        { length: 11 },
        (_, index) =>
          new Receivable({
            ...rec1,
            id: `rec-${index + 1}`,
            dueDate: new Date(Date.UTC(2026, 7, index + 1)),
          }),
      );
      const receivableRepo = {
        findOverdueCandidates: jest.fn().mockResolvedValue(candidates),
      };
      const customerRepo = {
        findByIds: jest
          .fn()
          .mockResolvedValue(
            new Map([['cust-1', { id: 'cust-1', name: 'Công ty Alpha' }]]),
          ),
      };
      const invoiceRepo = {
        findByIds: jest
          .fn()
          .mockResolvedValue(
            new Map([['inv-1', { id: 'inv-1', invoiceNumber: 'INV-001' }]]),
          ),
      };
      const tenantContext = new TenantContextService();
      const tool = new FindOverdueReceivablesTool(
        receivableRepo as any,
        customerRepo as any,
        invoiceRepo as any,
        tenantContext,
      );

      const result = await tenantContext.run(
        { userId: 'u-1', organizationId: 'org-1', role: Role.FINANCE_MANAGER },
        () => tool.execute({}, fixedNow),
      );

      expect(receivableRepo.findOverdueCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 11 }),
      );
      expect(result.items).toHaveLength(10);
      expect(result.items[9].receivableId).toBe('rec-10');
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toEqual({
        dueDate: '2026-08-10T00:00:00.000Z',
        receivableId: 'rec-10',
      });
    });

    it('searches customer names and invoice numbers in parallel and passes resolved ID sets to receivable repo', async () => {
      const receivableRepo = {
        findOverdueCandidates: jest.fn().mockResolvedValue([rec1]),
      };
      const customerRepo = {
        findIdsBySearch: jest.fn().mockResolvedValue(['cust-1']),
        findByIds: jest
          .fn()
          .mockResolvedValue(
            new Map([['cust-1', { id: 'cust-1', name: 'Công ty Alpha' }]]),
          ),
      };
      const invoiceRepo = {
        findIdsByInvoiceNumberSearch: jest.fn().mockResolvedValue(['inv-1']),
        findByIds: jest
          .fn()
          .mockResolvedValue(
            new Map([['inv-1', { id: 'inv-1', invoiceNumber: 'INV-001' }]]),
          ),
      };
      const tenantContext = new TenantContextService();
      const cursor = {
        dueDate: '2026-08-01T00:00:00.000Z',
        receivableId: 'rec-1',
      };
      const input = { search: 'Alpha', cursor };

      const tool = new FindOverdueReceivablesTool(
        receivableRepo as any,
        customerRepo as any,
        invoiceRepo as any,
        tenantContext,
      );

      const result = await tenantContext.run(
        { userId: 'u-1', organizationId: 'org-1', role: Role.FINANCE_MANAGER },
        () => tool.execute(input, fixedNow),
      );

      expect(customerRepo.findIdsBySearch).toHaveBeenCalledWith(
        'org-1',
        'Alpha',
      );
      expect(invoiceRepo.findIdsByInvoiceNumberSearch).toHaveBeenCalledWith(
        'org-1',
        'Alpha',
      );
      expect(receivableRepo.findOverdueCandidates).toHaveBeenCalledWith({
        organizationId: 'org-1',
        referenceDate: fixedNow,
        salesRepresentativeId: undefined,
        customerIdIn: ['cust-1'],
        invoiceIdIn: ['inv-1'],
        after: { dueDate: new Date(cursor.dueDate), id: cursor.receivableId },
        sortBy: 'due_date_asc',
        limit: 11,
      });
      expect(result.items).toHaveLength(1);
      expect(result).toMatchObject({ hasMore: false, nextCursor: null });
    });

    it('returns empty items without querying receivables when search yields no customer or invoice match', async () => {
      const receivableRepo = {
        findOverdueCandidates: jest.fn(),
      };
      const customerRepo = {
        findIdsBySearch: jest.fn().mockResolvedValue([]),
        findByIds: jest.fn(),
      };
      const invoiceRepo = {
        findIdsByInvoiceNumberSearch: jest.fn().mockResolvedValue([]),
        findByIds: jest.fn(),
      };
      const tenantContext = new TenantContextService();

      const tool = new FindOverdueReceivablesTool(
        receivableRepo as any,
        customerRepo as any,
        invoiceRepo as any,
        tenantContext,
      );

      const result = await tenantContext.run(
        { userId: 'u-1', organizationId: 'org-1', role: Role.FINANCE_MANAGER },
        () => tool.execute({ search: 'NonExistent' }, fixedNow),
      );

      expect(result).toEqual({ items: [], hasMore: false, nextCursor: null });
      expect(receivableRepo.findOverdueCandidates).not.toHaveBeenCalled();
    });

    it('throws VALIDATION_ERROR when limit is above 10, below 1, or non-integer', async () => {
      const tenantContext = new TenantContextService();
      const tool = new FindOverdueReceivablesTool(
        { findOverdueCandidates: jest.fn().mockResolvedValue([]) } as any,
        {} as any,
        {} as any,
        tenantContext,
      );

      await expect(
        tenantContext.run(
          { userId: 'u-1', organizationId: 'org-1', role: Role.OWNER },
          () => tool.execute({ limit: 11 }),
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.VALIDATION_ERROR,
        }),
      );

      await expect(
        tenantContext.run(
          { userId: 'u-1', organizationId: 'org-1', role: Role.OWNER },
          () => tool.execute({ limit: 0 }),
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.VALIDATION_ERROR,
        }),
      );

      await expect(
        tenantContext.run(
          { userId: 'u-1', organizationId: 'org-1', role: Role.OWNER },
          () => tool.execute({ limit: 3.5 }),
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.VALIDATION_ERROR,
        }),
      );
    });

    it('passes salesRepresentativeId when the current user is a SALES_REP', async () => {
      const receivableRepo = {
        findOverdueCandidates: jest.fn().mockResolvedValue([]),
      };
      const customerRepo = { findByIds: jest.fn() };
      const invoiceRepo = { findByIds: jest.fn() };
      const tenantContext = new TenantContextService();

      const tool = new FindOverdueReceivablesTool(
        receivableRepo as any,
        customerRepo as any,
        invoiceRepo as any,
        tenantContext,
      );

      await tenantContext.run(
        {
          userId: 'rep-user-42',
          organizationId: 'org-1',
          role: Role.SALES_REP,
        },
        () => tool.execute({}, fixedNow),
      );

      expect(receivableRepo.findOverdueCandidates).toHaveBeenCalledWith(
        expect.objectContaining({
          salesRepresentativeId: 'rep-user-42',
        }),
      );
    });

    it('uses batched lookups and provides a human-readable fallback when customer is missing', async () => {
      const recWithoutCustomer = new Receivable({
        id: 'rec-3',
        organizationId: 'org-1',
        customerId: 'cust-missing',
        invoiceId: null,
        originalAmount: 1_000_000,
        paidAmount: 0,
        dueDate: new Date('2026-08-01T00:00:00.000Z'),
        status: ReceivableStatus.OPEN,
        salesRepresentativeId: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        closedAt: null,
        version: 1,
      });

      const receivableRepo = {
        findOverdueCandidates: jest
          .fn()
          .mockResolvedValue([recWithoutCustomer]),
      };
      const customerRepo = {
        findByIds: jest.fn().mockResolvedValue(new Map()),
      };
      const invoiceRepo = {
        findByIds: jest.fn().mockResolvedValue(new Map()),
      };
      const tenantContext = new TenantContextService();

      const tool = new FindOverdueReceivablesTool(
        receivableRepo as any,
        customerRepo as any,
        invoiceRepo as any,
        tenantContext,
      );

      const result = await tenantContext.run(
        { userId: 'u-1', organizationId: 'org-1', role: Role.OWNER },
        () => tool.execute({}, fixedNow),
      );

      expect(customerRepo.findByIds).toHaveBeenCalledTimes(1);
      expect(result.items[0].customerName).toBe('Khách hàng không xác định');
      expect(result.items[0].customerName).not.toContain('cust-missing');
    });
  });
});
