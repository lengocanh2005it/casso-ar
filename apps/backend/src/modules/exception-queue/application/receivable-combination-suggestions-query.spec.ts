import { ReceivableStatus } from '@casso-ar/shared-types';
import { Receivable } from '../../receivables/domain/receivable';
import { UnmatchedBankTransactionsQueryService } from './unmatched-bank-transactions-query.service';

function receivable(
  id: string,
  invoiceId: string,
  originalAmount: number,
  paidAmount = 0,
) {
  return new Receivable({
    id,
    organizationId: 'org-1',
    customerId: 'customer-1',
    invoiceId,
    originalAmount,
    paidAmount,
    dueDate: new Date('2026-08-31T00:00:00.000Z'),
    status:
      paidAmount > 0 ? ReceivableStatus.PARTIALLY_PAID : ReceivableStatus.OPEN,
    salesRepresentativeId: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    closedAt: null,
    version: 1,
  });
}

function setup({
  transaction = { id: 'bank-1', status: 'PENDING_REVIEW', amount: 100 },
  candidates = [{ customerId: 'customer-1' }, { customerId: 'customer-1' }],
  receivables = [
    receivable('receivable-1', 'invoice-1', 40),
    receivable('receivable-2', 'invoice-2', 80, 20),
    receivable('receivable-3', 'invoice-3', 100),
  ],
}: {
  transaction?: { id: string; status: string; amount: number } | null;
  candidates?: Array<{ customerId: string }>;
  receivables?: Receivable[];
} = {}) {
  const bankTransactionRepo = {
    findById: jest.fn().mockResolvedValue(transaction),
  };
  const matchingCandidateRepo = {
    findByBankTransactionId: jest.fn().mockResolvedValue(candidates),
  };
  const receivableRepo = {
    findOpenByCustomerIdWithLimit: jest.fn().mockResolvedValue(receivables),
  };
  const customerRepo = {
    findByIds: jest
      .fn()
      .mockResolvedValue(
        new Map([['customer-1', { id: 'customer-1', name: 'Công ty A' }]]),
      ),
  };
  const invoiceRepo = {
    findByIds: jest.fn().mockResolvedValue(
      new Map([
        ['invoice-1', { id: 'invoice-1', invoiceNumber: 'INV-001' }],
        ['invoice-2', { id: 'invoice-2', invoiceNumber: 'INV-002' }],
        ['invoice-3', { id: 'invoice-3', invoiceNumber: 'INV-003' }],
      ]),
    ),
  };
  const service = new UnmatchedBankTransactionsQueryService(
    bankTransactionRepo as never,
    matchingCandidateRepo as never,
    receivableRepo as never,
    customerRepo as never,
    invoiceRepo as never,
    { findActiveByAccountNumbers: jest.fn().mockResolvedValue([]) } as never,
  );

  return {
    service,
    bankTransactionRepo,
    matchingCandidateRepo,
    receivableRepo,
    customerRepo,
    invoiceRepo,
  };
}

describe('receivable combination suggestions query', () => {
  it('returns not found for an unknown bank transaction', async () => {
    const { service } = setup({ transaction: null });

    await expect(
      service.combinationSuggestions('missing'),
    ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
  });

  it('searches all open balances when candidate rows resolve to one customer', async () => {
    const { service, receivableRepo } = setup();

    await expect(service.combinationSuggestions('bank-1')).resolves.toEqual({
      status: 'COMPLETE',
      combinations: [
        {
          receivables: [
            {
              receivableId: 'receivable-1',
              customerId: 'customer-1',
              customerName: 'Công ty A',
              invoiceNumber: 'INV-001',
              remainingAmount: 40,
              dueDate: new Date('2026-08-31T00:00:00.000Z'),
            },
            {
              receivableId: 'receivable-2',
              customerId: 'customer-1',
              customerName: 'Công ty A',
              invoiceNumber: 'INV-002',
              remainingAmount: 60,
              dueDate: new Date('2026-08-31T00:00:00.000Z'),
            },
          ],
        },
      ],
    });
    expect(receivableRepo.findOpenByCustomerIdWithLimit).toHaveBeenCalledWith(
      'customer-1',
      101,
    );
  });

  it('requires a customer selection when candidates span multiple customers', async () => {
    const { service, receivableRepo } = setup({
      candidates: [{ customerId: 'customer-1' }, { customerId: 'customer-2' }],
    });

    await expect(service.combinationSuggestions('bank-1')).resolves.toEqual({
      status: 'CUSTOMER_REQUIRED',
      combinations: [],
    });
    expect(receivableRepo.findOpenByCustomerIdWithLimit).not.toHaveBeenCalled();
  });

  it('uses an operator-selected customer even when matching candidates span customers', async () => {
    const { service, receivableRepo } = setup({
      candidates: [{ customerId: 'customer-1' }, { customerId: 'customer-2' }],
    });

    await service.combinationSuggestions('bank-1', 'customer-1');

    expect(receivableRepo.findOpenByCustomerIdWithLimit).toHaveBeenCalledWith(
      'customer-1',
      101,
    );
  });

  it('returns incomplete for transactions that are no longer in the exception queue', async () => {
    const { service, receivableRepo } = setup({
      transaction: { id: 'bank-1', status: 'MATCHED', amount: 100 },
    });

    await expect(
      service.combinationSuggestions('bank-1'),
    ).rejects.toMatchObject({ errorCode: 'CONFLICT' });
    expect(receivableRepo.findOpenByCustomerIdWithLimit).not.toHaveBeenCalled();
  });
});
