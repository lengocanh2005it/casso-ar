import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Test } from '@nestjs/testing';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { CUSTOMER_REPOSITORY } from '../../customers/application/customer-repository.port';
import { DISPUTE_REPOSITORY } from '../../disputes/application/dispute-repository.port';
import { INVOICE_REPOSITORY } from '../../invoices/application/invoice-repository.port';
import { Receivable } from '../domain/receivable';
import { ListReceivablesUseCase } from './list-receivables.usecase';
import { RECEIVABLE_REPOSITORY } from './receivable-repository.port';

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
      findIdsByInvoiceNumberSearch: jest.fn().mockResolvedValue([]),
    };
    const customerRepo = {
      findByIds: jest
        .fn()
        .mockResolvedValue(new Map([['customer-1', { name: 'Acme Co' }]])),
      findIdsBySearch: jest.fn().mockResolvedValue([]),
    };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
      getCurrentUser: jest
        .fn()
        .mockReturnValue({ userId: 'user-1', role: 'OWNER' }),
    };
    return {
      receivableRepo,
      disputeRepo,
      invoiceRepo,
      customerRepo,
      tenantContext,
    };
  }

  it('batches the open-dispute lookup instead of querying per row', async () => {
    const {
      receivableRepo,
      disputeRepo,
      invoiceRepo,
      customerRepo,
      tenantContext,
    } = buildDeps();
    const useCase = new ListReceivablesUseCase(
      receivableRepo as any,
      disputeRepo as any,
      invoiceRepo as any,
      customerRepo as any,
      tenantContext as any,
    );

    const result = await useCase.execute({ filters: {}, page: 1, limit: 20 });

    expect(disputeRepo.findOpenDisputesByReceivableIds).toHaveBeenCalledWith([
      'receivable-1',
    ]);
    expect(disputeRepo.findOpenDispute).not.toHaveBeenCalled();
    expect(result.items[0].isDisputed).toBe(true);
    expect(result.items[0].disputeId).toBe('dispute-1');
    expect(result.items[0].receivable).toBeInstanceOf(Receivable);
  });

  it('resolves invoiceNumber from the batched invoice lookup', async () => {
    const {
      receivableRepo,
      disputeRepo,
      invoiceRepo,
      customerRepo,
      tenantContext,
    } = buildDeps();
    const useCase = new ListReceivablesUseCase(
      receivableRepo as any,
      disputeRepo as any,
      invoiceRepo as any,
      customerRepo as any,
      tenantContext as any,
    );

    const result = await useCase.execute({ filters: {}, page: 1, limit: 20 });

    expect(invoiceRepo.findByIds).toHaveBeenCalledWith(['invoice-1']);
    expect(result.items[0].invoiceNumber).toBe('INV-001');
  });

  it('returns null invoiceNumber when the receivable has no invoice', async () => {
    const {
      receivableRepo,
      disputeRepo,
      invoiceRepo,
      customerRepo,
      tenantContext,
    } = buildDeps();
    receivableRepo.findPage.mockResolvedValue([
      buildReceivable({ id: 'receivable-2', invoiceId: null }),
    ]);
    disputeRepo.findOpenDisputesByReceivableIds.mockResolvedValue(new Map());
    const useCase = new ListReceivablesUseCase(
      receivableRepo as any,
      disputeRepo as any,
      invoiceRepo as any,
      customerRepo as any,
      tenantContext as any,
    );

    const result = await useCase.execute({ filters: {}, page: 1, limit: 20 });

    expect(invoiceRepo.findByIds).toHaveBeenCalledWith([]);
    expect(result.items[0].invoiceNumber).toBeNull();
  });

  it('resolves customerName from the batched customer lookup', async () => {
    const {
      receivableRepo,
      disputeRepo,
      invoiceRepo,
      customerRepo,
      tenantContext,
    } = buildDeps();
    const useCase = new ListReceivablesUseCase(
      receivableRepo as any,
      disputeRepo as any,
      invoiceRepo as any,
      customerRepo as any,
      tenantContext as any,
    );

    const result = await useCase.execute({ filters: {}, page: 1, limit: 20 });

    expect(customerRepo.findByIds).toHaveBeenCalledWith(['customer-1']);
    expect(result.items[0].customerName).toBe('Acme Co');
  });

  it('marks a WRITTEN_OFF receivable as not overdue even with a past due date', async () => {
    const {
      receivableRepo,
      disputeRepo,
      invoiceRepo,
      customerRepo,
      tenantContext,
    } = buildDeps();
    receivableRepo.findPage.mockResolvedValue([
      buildReceivable({
        status: ReceivableStatus.WRITTEN_OFF,
        dueDate: new Date('2020-01-01'),
      }),
    ]);
    const useCase = new ListReceivablesUseCase(
      receivableRepo as any,
      disputeRepo as any,
      invoiceRepo as any,
      customerRepo as any,
      tenantContext as any,
    );

    const result = await useCase.execute({ filters: {}, page: 1, limit: 20 });

    expect(result.items[0].isOverdue).toBe(false);
  });

  it('resolves a search term into customerIdIn/invoiceIdIn filters before querying receivables', async () => {
    const {
      receivableRepo,
      disputeRepo,
      invoiceRepo,
      customerRepo,
      tenantContext,
    } = buildDeps();
    customerRepo.findIdsBySearch.mockResolvedValue(['customer-1']);
    invoiceRepo.findIdsByInvoiceNumberSearch.mockResolvedValue(['invoice-1']);
    const useCase = new ListReceivablesUseCase(
      receivableRepo as any,
      disputeRepo as any,
      invoiceRepo as any,
      customerRepo as any,
      tenantContext as any,
    );

    await useCase.execute({
      filters: {},
      search: 'acme',
      page: 1,
      limit: 20,
    });

    expect(customerRepo.findIdsBySearch).toHaveBeenCalledWith(
      'org-1',
      'acme',
      500,
    );
    expect(invoiceRepo.findIdsByInvoiceNumberSearch).toHaveBeenCalledWith(
      'org-1',
      'acme',
      500,
    );
    expect(receivableRepo.findPage).toHaveBeenCalledWith(
      'org-1',
      { customerIdIn: ['customer-1'], invoiceIdIn: ['invoice-1'] },
      1,
      20,
    );
    expect(receivableRepo.count).toHaveBeenCalledWith('org-1', {
      customerIdIn: ['customer-1'],
      invoiceIdIn: ['invoice-1'],
    });
  });

  it('does not resolve search filters when no search term is given', async () => {
    const {
      receivableRepo,
      disputeRepo,
      invoiceRepo,
      customerRepo,
      tenantContext,
    } = buildDeps();
    const useCase = new ListReceivablesUseCase(
      receivableRepo as any,
      disputeRepo as any,
      invoiceRepo as any,
      customerRepo as any,
      tenantContext as any,
    );

    await useCase.execute({ filters: {}, page: 1, limit: 20 });

    expect(customerRepo.findIdsBySearch).not.toHaveBeenCalled();
    expect(invoiceRepo.findIdsByInvoiceNumberSearch).not.toHaveBeenCalled();
  });

  it('can be resolved through the real NestJS DI container', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ListReceivablesUseCase,
        { provide: RECEIVABLE_REPOSITORY, useValue: {} },
        { provide: DISPUTE_REPOSITORY, useValue: {} },
        { provide: INVOICE_REPOSITORY, useValue: {} },
        { provide: CUSTOMER_REPOSITORY, useValue: {} },
        TenantContextService,
      ],
    }).compile();

    expect(moduleRef.get(ListReceivablesUseCase)).toBeInstanceOf(
      ListReceivablesUseCase,
    );
  });
});
