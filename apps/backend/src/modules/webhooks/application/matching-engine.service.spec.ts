import { ReceivableStatus } from '@casso-ar/shared-types';
import { Receivable } from '../../receivables/domain/receivable';
import { MatchingEngineService } from './matching-engine.service';

const transaction = {
  providerTransactionId: 'TX-001',
  amount: 30_000_000,
  transactionDateTime: new Date('2026-08-05'),
  counterpartyAccountNumber: '0011002233',
  counterpartyName: 'CONG TY B',
  transferContent: 'TT HD INV-2026-0012',
};
const receivable = new Receivable({
  id: 'rec-1',
  organizationId: 'org-1',
  customerId: 'cust-1',
  invoiceId: 'inv-1',
  originalAmount: 30_000_000,
  paidAmount: 0,
  dueDate: new Date('2026-08-20'),
  status: ReceivableStatus.OPEN,
  salesRepresentativeId: 'user-1',
  createdAt: new Date(),
  closedAt: null,
  version: 1,
});

const createInvoiceLookupMocks = () => ({
  findInvoiceIdsByReceivableIds: jest
    .fn()
    .mockResolvedValue(new Map([['rec-1', 'inv-1']])),
  findByIds: jest
    .fn()
    .mockResolvedValue(
      new Map([['inv-1', { invoiceNumber: 'INV-2026-0012' }]]),
    ),
});

describe('MatchingEngineService', () => {
  it('scores a known customer candidate using all five components', async () => {
    const invoiceLookup = createInvoiceLookupMocks();
    const service = new MatchingEngineService(
      {
        findActiveByAccountNumber: jest.fn().mockResolvedValue([
          {
            customerId: 'cust-1',
            accountNumber: '0011002233',
          },
        ]),
        save: jest.fn(),
      },
      {
        findOpenByCustomerId: jest.fn().mockResolvedValue([receivable]),
        findOpenByIds: jest.fn(),
        findOpenTopNByOrganization: jest.fn(),
        findOverdueByThreshold: jest.fn(),
        findOverdueCandidates: jest.fn(),
        findById: jest.fn(),
        findByIds: jest.fn(),
        findByIdForUpdate: jest.fn(),
        findInvoiceIdsByReceivableIds:
          invoiceLookup.findInvoiceIdsByReceivableIds,
        findPage: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        save: jest.fn(),
      },
      {
        findByIds: invoiceLookup.findByIds,
        findByInvoiceNumber: jest.fn(),
        findById: jest.fn(),
        findIdsByInvoiceNumberSearch: jest.fn(),
        save: jest.fn(),
      },
      {
        findNameById: jest.fn().mockResolvedValue('Company B'),
        findIdsBySearch: jest.fn(),
        findById: jest.fn(),
        findByIds: jest
          .fn()
          .mockResolvedValue(new Map([['cust-1', { name: 'Company B' }]])),
        findByTaxCode: jest.fn(),
        findByEmail: jest.fn(),
        findPage: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        save: jest.fn(),
      },
    );
    const [candidate] = await service.scoreCandidates(transaction, 'org-1');
    expect(candidate).toMatchObject({
      receivableId: 'rec-1',
      totalScore: 100,
      invoiceNumber: 'INV-2026-0012',
      customerName: 'Company B',
      remainingAmount: 30_000_000,
      dueDate: receivable.dueDate,
    });
    expect(invoiceLookup.findInvoiceIdsByReceivableIds).toHaveBeenCalledWith([
      'rec-1',
    ]);
    expect(invoiceLookup.findByIds).toHaveBeenCalledWith(['inv-1']);
  });

  it('resolves the customer via an exact reference code in transferContent when the bank account is unregistered', async () => {
    const findOpenByCustomerId = jest.fn().mockResolvedValue([receivable]);
    const invoiceLookup = createInvoiceLookupMocks();
    const service = new MatchingEngineService(
      {
        findActiveByAccountNumber: jest.fn().mockResolvedValue([]),
        save: jest.fn(),
      },
      {
        findOpenByCustomerId,
        findOpenByIds: jest.fn(),
        findOpenTopNByOrganization: jest.fn().mockResolvedValue([receivable]),
        findOverdueByThreshold: jest.fn(),
        findOverdueCandidates: jest.fn(),
        findById: jest.fn(),
        findByIds: jest.fn(),
        findByIdForUpdate: jest.fn(),
        findInvoiceIdsByReceivableIds:
          invoiceLookup.findInvoiceIdsByReceivableIds,
        findPage: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        save: jest.fn(),
      },
      {
        findByIds: invoiceLookup.findByIds,
        findByInvoiceNumber: jest.fn(),
        findById: jest.fn(),
        findIdsByInvoiceNumberSearch: jest.fn(),
        save: jest.fn(),
      },
      {
        findNameById: jest.fn().mockResolvedValue('Company B'),
        findIdsBySearch: jest.fn(),
        findById: jest.fn(),
        findByIds: jest
          .fn()
          .mockResolvedValue(new Map([['cust-1', { name: 'Company B' }]])),
        findByTaxCode: jest.fn(),
        findByEmail: jest.fn(),
        findPage: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        save: jest.fn(),
      },
    );

    const [candidate] = await service.scoreCandidates(transaction, 'org-1');

    expect(findOpenByCustomerId).toHaveBeenCalledWith('cust-1');
    expect(invoiceLookup.findInvoiceIdsByReceivableIds).toHaveBeenCalledTimes(
      2,
    );
    expect(invoiceLookup.findByIds).toHaveBeenCalledTimes(2);
    expect(candidate).toMatchObject({
      receivableId: 'rec-1',
      referenceCodeScore: 60,
      payerNameScore: 5,
      timingScore: 5,
      customerBankAccountScore: 0,
      invoiceNumber: 'INV-2026-0012',
      customerName: 'Company B',
    });
  });

  describe('fan-out over linked customers', () => {
    function link(overrides: { customerId: string; accountNumber: string }) {
      return {
        id: 'link-1',
        organizationId: 'org-1',
        customerId: overrides.customerId,
        accountNumber: overrides.accountNumber,
        isActive: true,
      };
    }

    function openReceivable(id: string, customerId: string): Receivable {
      return new Receivable({
        id,
        organizationId: 'org-1',
        customerId,
        invoiceId: `inv-${id}`,
        originalAmount: 30_000_000,
        paidAmount: 0,
        dueDate: new Date('2026-08-20'),
        status: ReceivableStatus.OPEN,
        salesRepresentativeId: 'user-1',
        createdAt: new Date(),
        closedAt: null,
        version: 1,
      });
    }

    function txn(
      overrides: Partial<typeof transaction> = {},
    ): typeof transaction {
      return {
        ...transaction,
        ...overrides,
      };
    }

    let bankAccountRepo: any;
    let receivableRepo: any;
    let customerRepo: any;
    let invoiceRepo: any;
    let service: MatchingEngineService;

    beforeEach(() => {
      bankAccountRepo = {
        findActiveByAccountNumber: jest.fn(),
        save: jest.fn(),
      };
      receivableRepo = {
        findOpenByCustomerId: jest.fn().mockResolvedValue([]),
        findOpenByIds: jest.fn(),
        findOpenTopNByOrganization: jest.fn().mockResolvedValue([]),
        findInvoiceIdsByReceivableIds: jest.fn().mockResolvedValue(new Map()),
        findById: jest.fn(),
        findByIds: jest.fn(),
        findByIdForUpdate: jest.fn(),
        findPage: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        save: jest.fn(),
      };
      customerRepo = {
        findNameById: jest.fn().mockResolvedValue(null),
        findByIds: jest.fn().mockResolvedValue(new Map()),
        findIdsBySearch: jest.fn(),
        findById: jest.fn(),
        findByTaxCode: jest.fn(),
        findByEmail: jest.fn(),
        findPage: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        save: jest.fn(),
      };
      invoiceRepo = {
        findByIds: jest.fn().mockResolvedValue(new Map()),
        findByInvoiceNumber: jest.fn(),
        findById: jest.fn(),
        findIdsByInvoiceNumberSearch: jest.fn(),
        save: jest.fn(),
      };
      service = new MatchingEngineService(
        bankAccountRepo,
        receivableRepo,
        invoiceRepo,
        customerRepo,
      );
    });

    it('unions open receivables across every customer linked to the payer account', async () => {
      bankAccountRepo.findActiveByAccountNumber.mockResolvedValue([
        link({ customerId: 'cust-1', accountNumber: '9990001' }),
        link({ customerId: 'cust-2', accountNumber: '9990001' }),
      ]);
      receivableRepo.findOpenByCustomerId.mockImplementation((id: string) =>
        Promise.resolve(
          id === 'cust-1'
            ? [openReceivable('r1', 'cust-1')]
            : [openReceivable('r2', 'cust-2')],
        ),
      );

      const scored = await service.scoreCandidates(
        txn({ counterpartyAccountNumber: '9990001' }),
        'org-1',
      );

      expect(scored.map((c) => c.receivableId).sort()).toEqual(['r1', 'r2']);
      expect(scored.every((c) => c.customerBankAccountScore === 10)).toBe(true);
      expect(receivableRepo.findOpenTopNByOrganization).not.toHaveBeenCalled();
    });

    it('still scopes to the single linked customer when only one link exists', async () => {
      bankAccountRepo.findActiveByAccountNumber.mockResolvedValue([
        link({ customerId: 'cust-1', accountNumber: '9990001' }),
      ]);
      receivableRepo.findOpenByCustomerId.mockResolvedValue([
        openReceivable('r1', 'cust-1'),
      ]);

      const scored = await service.scoreCandidates(
        txn({ counterpartyAccountNumber: '9990001' }),
        'org-1',
      );

      expect(scored.map((c) => c.receivableId)).toEqual(['r1']);
      expect(receivableRepo.findOpenByCustomerId).toHaveBeenCalledWith(
        'cust-1',
      );
    });

    it('scores a third-party payer whose name differs from the linked customer', async () => {
      bankAccountRepo.findActiveByAccountNumber.mockResolvedValue([
        link({ customerId: 'cust-1', accountNumber: '9990001' }),
      ]);
      receivableRepo.findOpenByCustomerId.mockResolvedValue([
        openReceivable('r1', 'cust-1'),
      ]);
      customerRepo.findNameById.mockResolvedValue('Cong ty A');
      customerRepo.findByIds.mockResolvedValue(
        new Map([['cust-1', { name: 'Cong ty A' }]]),
      );

      const [candidate] = await service.scoreCandidates(
        txn({
          counterpartyAccountNumber: '9990001',
          counterpartyName: 'NGUYEN VAN B',
        }),
        'org-1',
      );

      expect(candidate.customerBankAccountScore).toBe(10); // account signal holds
      expect(candidate.customerId).toBe('cust-1'); // no mismatch rejection here
    });

    it('falls back to the org-wide scan when the payer account is unknown', async () => {
      bankAccountRepo.findActiveByAccountNumber.mockResolvedValue([]);
      receivableRepo.findOpenTopNByOrganization.mockResolvedValue([
        openReceivable('r9', 'cust-9'),
      ]);

      const scored = await service.scoreCandidates(
        txn({ counterpartyAccountNumber: '404' }),
        'org-1',
      );

      expect(receivableRepo.findOpenTopNByOrganization).toHaveBeenCalled();
      expect(scored.map((c) => c.receivableId)).toEqual(['r9']);
    });
  });
});
