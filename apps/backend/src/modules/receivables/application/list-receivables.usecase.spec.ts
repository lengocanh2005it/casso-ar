import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Receivable } from '../domain/receivable';
import { ListReceivablesUseCase } from './list-receivables.usecase';

function buildReceivable(overrides: Partial<Receivable> = {}): Receivable {
  return new Receivable({
    id: 'receivable-1',
    organizationId: 'org-1',
    customerId: 'customer-1',
    invoiceId: 'invoice-1',
    originalAmount: 50_000_000,
    paidAmount: 0,
    dueDate: new Date('2026-08-20'),
    status: ReceivableStatus.OPEN,
    salesRepresentativeId: null,
    createdAt: new Date('2026-07-20'),
    closedAt: null,
    version: 1,
    ...overrides,
  });
}

describe('ListReceivablesUseCase', () => {
  function buildDeps() {
    const receivableRepo = {
      findPage: jest.fn().mockResolvedValue([buildReceivable()]),
      count: jest.fn().mockResolvedValue(1),
    };
    const disputeRepo = {
      findOpenDisputesByReceivableIds: jest
        .fn()
        .mockResolvedValue(new Map([['receivable-1', 'dispute-1']])),
      findOpenDispute: jest.fn(),
    };
    const invoiceRepo = {
      findByIds: jest
        .fn()
        .mockResolvedValue(
          new Map([['invoice-1', { invoiceNumber: 'INV-001' }]]),
        ),
    };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
      getCurrentUser: jest
        .fn()
        .mockReturnValue({ userId: 'user-1', role: 'OWNER' }),
    };
    return { receivableRepo, disputeRepo, invoiceRepo, tenantContext };
  }

  it('batches the open-dispute lookup instead of querying per row', async () => {
    const { receivableRepo, disputeRepo, invoiceRepo, tenantContext } =
      buildDeps();
    const useCase = new ListReceivablesUseCase(
      receivableRepo as any,
      disputeRepo as any,
      invoiceRepo as any,
      tenantContext as any,
    );

    const result = await useCase.execute({ filters: {}, page: 1, limit: 20 });

    expect(disputeRepo.findOpenDisputesByReceivableIds).toHaveBeenCalledWith([
      'receivable-1',
    ]);
    expect(disputeRepo.findOpenDispute).not.toHaveBeenCalled();
    expect(result.items[0].isDisputed).toBe(true);
    expect(result.items[0].disputeId).toBe('dispute-1');
  });

  it('resolves invoiceNumber from the batched invoice lookup', async () => {
    const { receivableRepo, disputeRepo, invoiceRepo, tenantContext } =
      buildDeps();
    const useCase = new ListReceivablesUseCase(
      receivableRepo as any,
      disputeRepo as any,
      invoiceRepo as any,
      tenantContext as any,
    );

    const result = await useCase.execute({ filters: {}, page: 1, limit: 20 });

    expect(invoiceRepo.findByIds).toHaveBeenCalledWith(['invoice-1']);
    expect(result.items[0].invoiceNumber).toBe('INV-001');
  });

  it('returns null invoiceNumber when the receivable has no invoice', async () => {
    const { receivableRepo, disputeRepo, invoiceRepo, tenantContext } =
      buildDeps();
    receivableRepo.findPage.mockResolvedValue([
      buildReceivable({ id: 'receivable-2', invoiceId: null }),
    ]);
    disputeRepo.findOpenDisputesByReceivableIds.mockResolvedValue(new Map());
    const useCase = new ListReceivablesUseCase(
      receivableRepo as any,
      disputeRepo as any,
      invoiceRepo as any,
      tenantContext as any,
    );

    const result = await useCase.execute({ filters: {}, page: 1, limit: 20 });

    expect(invoiceRepo.findByIds).toHaveBeenCalledWith([]);
    expect(result.items[0].invoiceNumber).toBeNull();
  });
});
