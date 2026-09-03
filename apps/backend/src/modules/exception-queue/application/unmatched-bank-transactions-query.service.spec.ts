import { UnmatchedBankTransactionsQueryService } from './unmatched-bank-transactions-query.service';

describe('UnmatchedBankTransactionsQueryService', () => {
  it('pairs pending transactions with top candidates in one batch lookup', async () => {
    const transactions = [{ id: 'bt-1' }, { id: 'bt-2' }];
    const bankTransactionRepo = {
      findManyByStatus: jest.fn().mockResolvedValue(transactions),
      countByStatus: jest.fn().mockResolvedValue(2),
    };
    const matchingCandidateRepo = {
      findTopByBankTransactionIds: jest
        .fn()
        .mockResolvedValue(new Map([['bt-1', { id: 'mc-1', totalScore: 80 }]])),
    };
    const receivableRepo = {
      findByIds: jest.fn().mockResolvedValue(new Map()),
      findOpenByIds: jest.fn().mockResolvedValue([]),
    };
    const customerRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const invoiceRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };

    const service = new UnmatchedBankTransactionsQueryService(
      bankTransactionRepo as never,
      matchingCandidateRepo as never,
      receivableRepo as never,
      customerRepo as never,
      invoiceRepo as never,
    );

    await expect(service.execute()).resolves.toEqual({
      items: [
        {
          transaction: { id: 'bt-1' },
          topCandidate: {
            candidate: { id: 'mc-1', totalScore: 80 },
            invoiceNumber: null,
            customerName: null,
            remainingAmount: null,
            dueDate: null,
          },
          aiRecommendation: null,
          payer: {
            accountNumberMasked: '',
            name: '',
            linkedCustomers: [],
          },
        },
        {
          transaction: { id: 'bt-2' },
          topCandidate: null,
          aiRecommendation: null,
          payer: {
            accountNumberMasked: '',
            name: '',
            linkedCustomers: [],
          },
        },
      ],
      total: 2,
      page: 1,
      limit: 20,
    });
    expect(
      matchingCandidateRepo.findTopByBankTransactionIds,
    ).toHaveBeenCalledWith(['bt-1', 'bt-2']);
  });

  it('delegates paging to the repository via skip/take instead of loading the full queue', async () => {
    const bankTransactionRepo = {
      findManyByStatus: jest.fn().mockResolvedValue([]),
      countByStatus: jest.fn().mockResolvedValue(45),
    };
    const matchingCandidateRepo = {
      findTopByBankTransactionIds: jest.fn().mockResolvedValue(new Map()),
    };
    const receivableRepo = {
      findByIds: jest.fn().mockResolvedValue(new Map()),
      findOpenByIds: jest.fn().mockResolvedValue([]),
    };
    const customerRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const invoiceRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };

    const service = new UnmatchedBankTransactionsQueryService(
      bankTransactionRepo as never,
      matchingCandidateRepo as never,
      receivableRepo as never,
      customerRepo as never,
      invoiceRepo as never,
    );

    const result = await service.execute(3, 10);

    expect(bankTransactionRepo.findManyByStatus).toHaveBeenCalledWith(
      'PENDING_REVIEW',
      { skip: 20, take: 10 },
    );
    expect(result.total).toBe(45);
  });

  it('forwards a search term to the repository for both the page and the count', async () => {
    const bankTransactionRepo = {
      findManyByStatus: jest.fn().mockResolvedValue([]),
      countByStatus: jest.fn().mockResolvedValue(0),
    };
    const matchingCandidateRepo = {
      findTopByBankTransactionIds: jest.fn().mockResolvedValue(new Map()),
    };
    const receivableRepo = {
      findByIds: jest.fn().mockResolvedValue(new Map()),
      findOpenByIds: jest.fn().mockResolvedValue([]),
    };
    const customerRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const invoiceRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };

    const service = new UnmatchedBankTransactionsQueryService(
      bankTransactionRepo as never,
      matchingCandidateRepo as never,
      receivableRepo as never,
      customerRepo as never,
      invoiceRepo as never,
    );

    await service.execute(1, 20, 'nguyen van a');

    expect(bankTransactionRepo.findManyByStatus).toHaveBeenCalledWith(
      'PENDING_REVIEW',
      { skip: 0, take: 20, search: 'nguyen van a' },
    );
    expect(bankTransactionRepo.countByStatus).toHaveBeenCalledWith(
      'PENDING_REVIEW',
      'nguyen van a',
    );
  });

  it('marks a successful recommendation current only when its receivable is still open', async () => {
    const transaction = {
      id: 'bt-1',
      aiRecommendation: {
        status: 'SUCCEEDED',
        recommendedReceivableId: 'rec-1',
        confidence: 80,
        reason: 'Khớp.',
      },
    };
    const bankTransactionRepo = {
      findManyByStatus: jest.fn().mockResolvedValue([transaction]),
      countByStatus: jest.fn().mockResolvedValue(1),
    };
    const matchingCandidateRepo = {
      findTopByBankTransactionIds: jest.fn().mockResolvedValue(new Map()),
    };
    const receivableRepo = {
      findByIds: jest.fn().mockResolvedValue(new Map()),
      findOpenByIds: jest.fn().mockResolvedValue([{ id: 'rec-1' }]),
    };
    const customerRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const invoiceRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const service = new UnmatchedBankTransactionsQueryService(
      bankTransactionRepo as never,
      matchingCandidateRepo as never,
      receivableRepo as never,
      customerRepo as never,
      invoiceRepo as never,
    );

    await expect(service.execute()).resolves.toMatchObject({
      items: [
        {
          aiRecommendation: {
            status: 'SUCCEEDED',
            recommendedReceivableId: 'rec-1',
            confidence: 80,
            reason: 'Khớp.',
            isCurrent: true,
          },
        },
      ],
    });
    expect(receivableRepo.findOpenByIds).toHaveBeenCalledWith(['rec-1']);
  });

  it('keeps a stale recommendation as history with isCurrent false', async () => {
    const transaction = {
      id: 'bt-1',
      aiRecommendation: {
        status: 'SUCCEEDED',
        recommendedReceivableId: 'rec-closed',
        confidence: 90,
        reason: 'Khớp số tiền.',
      },
    };
    const bankTransactionRepo = {
      findManyByStatus: jest.fn().mockResolvedValue([transaction]),
      countByStatus: jest.fn().mockResolvedValue(1),
    };
    const matchingCandidateRepo = {
      findTopByBankTransactionIds: jest.fn().mockResolvedValue(new Map()),
    };
    const receivableRepo = {
      findByIds: jest.fn().mockResolvedValue(new Map()),
      findOpenByIds: jest.fn().mockResolvedValue([]),
    };
    const customerRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const invoiceRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const service = new UnmatchedBankTransactionsQueryService(
      bankTransactionRepo as never,
      matchingCandidateRepo as never,
      receivableRepo as never,
      customerRepo as never,
      invoiceRepo as never,
    );

    await expect(service.execute()).resolves.toMatchObject({
      items: [
        {
          aiRecommendation: {
            status: 'SUCCEEDED',
            recommendedReceivableId: 'rec-closed',
            isCurrent: false,
          },
        },
      ],
    });
  });

  it('returns abstained and failed states without a candidate suggestion', async () => {
    const transactions = [
      {
        id: 'bt-abstain',
        aiRecommendation: {
          status: 'ABSTAINED',
          recommendedReceivableId: null,
          confidence: 40,
          reason: 'Không đủ dữ kiện.',
        },
      },
      {
        id: 'bt-failed',
        aiRecommendation: {
          status: 'FAILED',
          recommendedReceivableId: null,
          confidence: null,
          reason: null,
          failureCode: 'TIMEOUT',
        },
      },
    ];
    const bankTransactionRepo = {
      findManyByStatus: jest.fn().mockResolvedValue(transactions),
      countByStatus: jest.fn().mockResolvedValue(2),
    };
    const matchingCandidateRepo = {
      findTopByBankTransactionIds: jest.fn().mockResolvedValue(new Map()),
    };
    const receivableRepo = {
      findByIds: jest.fn().mockResolvedValue(new Map()),
      findOpenByIds: jest.fn().mockResolvedValue([]),
    };
    const customerRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const invoiceRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const service = new UnmatchedBankTransactionsQueryService(
      bankTransactionRepo as never,
      matchingCandidateRepo as never,
      receivableRepo as never,
      customerRepo as never,
      invoiceRepo as never,
    );

    await expect(service.execute()).resolves.toMatchObject({
      items: [
        { aiRecommendation: { status: 'ABSTAINED', isCurrent: false } },
        { aiRecommendation: { status: 'FAILED', isCurrent: false } },
      ],
    });
    expect(receivableRepo.findOpenByIds).not.toHaveBeenCalled();
  });

  it('enriches matching candidates with business labels using batch lookups', async () => {
    const bankTransactionRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'bt-1' }),
    };
    const matchingCandidateRepo = {
      findByBankTransactionId: jest.fn().mockResolvedValue([
        { id: 'mc-1', receivableId: 'rec-1', customerId: 'customer-1' },
        { id: 'mc-2', receivableId: 'missing', customerId: 'missing-customer' },
      ]),
    };
    const receivableRepo = {
      findByIds: jest.fn().mockResolvedValue(
        new Map([
          [
            'rec-1',
            {
              customerId: 'customer-1',
              invoiceId: 'invoice-1',
              originalAmount: 200_000,
              paidAmount: 50_000,
              dueDate: new Date('2026-08-01'),
            },
          ],
        ]),
      ),
      findOpenByIds: jest.fn().mockResolvedValue([]),
    };
    const customerRepo = {
      findByIds: jest
        .fn()
        .mockResolvedValue(new Map([['customer-1', { name: 'Công ty Acme' }]])),
    };
    const invoiceRepo = {
      findByIds: jest
        .fn()
        .mockResolvedValue(
          new Map([['invoice-1', { invoiceNumber: 'INV-001' }]]),
        ),
    };

    const service = new UnmatchedBankTransactionsQueryService(
      bankTransactionRepo as never,
      matchingCandidateRepo as never,
      receivableRepo as never,
      customerRepo as never,
      invoiceRepo as never,
    );

    await expect(service.candidates('bt-1')).resolves.toEqual([
      {
        candidate: {
          id: 'mc-1',
          receivableId: 'rec-1',
          customerId: 'customer-1',
        },
        invoiceNumber: 'INV-001',
        customerName: 'Công ty Acme',
        remainingAmount: 150_000,
        dueDate: new Date('2026-08-01'),
      },
      {
        candidate: {
          id: 'mc-2',
          receivableId: 'missing',
          customerId: 'missing-customer',
        },
        invoiceNumber: null,
        customerName: null,
        remainingAmount: null,
        dueDate: null,
      },
    ]);
    expect(receivableRepo.findByIds).toHaveBeenCalledWith(['rec-1', 'missing']);
    expect(customerRepo.findByIds).toHaveBeenCalledWith([
      'customer-1',
      'missing-customer',
    ]);
    expect(invoiceRepo.findByIds).toHaveBeenCalledWith(['invoice-1']);
  });

  it('attaches a payer view with linked customers for each transaction', async () => {
    const bankTransaction = {
      id: 't1',
      counterpartyAccountNumber: '0123456789',
      counterpartyName: 'NGUYEN VAN A',
    };
    const bankTransactionRepo = {
      findManyByStatus: jest.fn().mockResolvedValue([bankTransaction]),
      countByStatus: jest.fn().mockResolvedValue(1),
    };
    const matchingCandidateRepo = {
      findTopByBankTransactionIds: jest.fn().mockResolvedValue(new Map()),
    };
    const receivableRepo = {
      findByIds: jest.fn().mockResolvedValue(new Map()),
      findOpenByIds: jest.fn().mockResolvedValue([]),
    };
    const customerRepo = {
      findByIds: jest.fn().mockResolvedValue(
        new Map([
          ['cust-1', { name: 'Cong ty A' }],
          ['cust-2', { name: 'Cong ty B' }],
        ]),
      ),
    };
    const invoiceRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const bankAccountRepo = {
      findActiveByAccountNumber: jest.fn().mockResolvedValue([
        { customerId: 'cust-1', accountNumber: '0123456789' },
        { customerId: 'cust-2', accountNumber: '0123456789' },
      ]),
    };

    const service = new UnmatchedBankTransactionsQueryService(
      bankTransactionRepo as never,
      matchingCandidateRepo as never,
      receivableRepo as never,
      customerRepo as never,
      invoiceRepo as never,
      bankAccountRepo as never,
    );

    const page = await service.execute(1, 20);

    expect(page.items[0].payer).toEqual({
      accountNumberMasked: expect.stringContaining('6789'),
      name: 'NGUYEN VAN A',
      linkedCustomers: [
        { customerId: 'cust-1', customerName: 'Cong ty A' },
        { customerId: 'cust-2', customerName: 'Cong ty B' },
      ],
    });
  });

  it('returns an empty linkedCustomers array for an unknown payer account', async () => {
    const bankTransaction = {
      id: 't1',
      counterpartyAccountNumber: '404',
      counterpartyName: 'UNKNOWN',
    };
    const bankTransactionRepo = {
      findManyByStatus: jest.fn().mockResolvedValue([bankTransaction]),
      countByStatus: jest.fn().mockResolvedValue(1),
    };
    const matchingCandidateRepo = {
      findTopByBankTransactionIds: jest.fn().mockResolvedValue(new Map()),
    };
    const receivableRepo = {
      findByIds: jest.fn().mockResolvedValue(new Map()),
      findOpenByIds: jest.fn().mockResolvedValue([]),
    };
    const customerRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const invoiceRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const bankAccountRepo = {
      findActiveByAccountNumber: jest.fn().mockResolvedValue([]),
    };

    const service = new UnmatchedBankTransactionsQueryService(
      bankTransactionRepo as never,
      matchingCandidateRepo as never,
      receivableRepo as never,
      customerRepo as never,
      invoiceRepo as never,
      bankAccountRepo as never,
    );

    const page = await service.execute(1, 20);

    expect(page.items[0].payer.linkedCustomers).toEqual([]);
    expect(page.items[0].payer.name).toBe('UNKNOWN');
  });
});
