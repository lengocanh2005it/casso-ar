import { ReceivableStatus } from '@casso-ledger/shared-types';
import { ExportReceivablesUseCase } from './export-receivables.usecase';

describe('ExportReceivablesUseCase', () => {
  const item = {
    receivable: {
      id: 'rec-1',
      invoiceId: 'inv-1',
      customerId: 'cust-1',
      originalAmount: 1000000,
      paidAmount: 400000,
      remainingAmount: 600000,
      dueDate: new Date('2026-08-10'),
      status: ReceivableStatus.OPEN,
    },
    isOverdue: true,
    isDisputed: false,
    disputeId: null,
    invoiceNumber: 'INV-001',
    customerName: 'Công ty A',
  };

  it('builds a CSV of all receivables matching the filters (up to 10000 rows)', async () => {
    const listReceivablesUseCase = {
      execute: jest
        .fn()
        .mockResolvedValue({ items: [item as never], total: 1 }),
    };
    const useCase = new ExportReceivablesUseCase(
      listReceivablesUseCase as never,
    );

    const csv = await useCase.execute({ filters: { status: 'OPEN' } });

    expect(listReceivablesUseCase.execute).toHaveBeenCalledWith({
      filters: { status: 'OPEN' },
      page: 1,
      limit: 10000,
    });
    expect(csv).toContain('INV-001');
    expect(csv).toContain('Công ty A');
    expect(csv).toContain('1000000');
    expect(csv).toContain('600000'); // remaining
  });

  it('neutralizes formula injection in exported cells', async () => {
    const malicious = {
      ...item,
      customerName: '=HYPERLINK("http://evil")',
    };
    const listReceivablesUseCase = {
      execute: jest
        .fn()
        .mockResolvedValue({ items: [malicious as never], total: 1 }),
    };
    const useCase = new ExportReceivablesUseCase(
      listReceivablesUseCase as never,
    );

    const csv = await useCase.execute({ filters: {} });

    expect(csv).toContain("'=HYPERLINK");
  });
});
