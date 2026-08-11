import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Receivable } from '../../../../modules/receivables/domain/receivable';
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
});
