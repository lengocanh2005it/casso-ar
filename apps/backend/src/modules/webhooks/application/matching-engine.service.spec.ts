import { ReceivableStatus } from '@casso-ledger/shared-types';
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

describe('MatchingEngineService', () => {
  it('scores a known customer candidate using all five components', async () => {
    const findInvoiceIdsByReceivableIds = jest
      .fn()
      .mockResolvedValue(new Map([['rec-1', 'inv-1']]));
    const findByIds = jest
      .fn()
      .mockResolvedValue(
        new Map([['inv-1', { invoiceNumber: 'INV-2026-0012' }]]),
      );
    const service = new MatchingEngineService(
      {
        findByAccountNumber: jest.fn().mockResolvedValue({
          customerId: 'cust-1',
          accountNumber: '0011002233',
        }),
        save: jest.fn(),
      },
      {
        findOpenByCustomerId: jest.fn().mockResolvedValue([receivable]),
        findOpenTopNByOrganization: jest.fn(),
        findById: jest.fn(),
        findByIdForUpdate: jest.fn(),
        findInvoiceIdsByReceivableIds,
        save: jest.fn(),
      },
      {
        findByIds,
        findById: jest.fn(),
        save: jest.fn(),
      },
      {
        findNameById: jest.fn().mockResolvedValue('Company B'),
        findById: jest.fn(),
        save: jest.fn(),
      },
    );
    const [candidate] = await service.scoreCandidates(transaction, 'org-1');
    expect(candidate).toMatchObject({ receivableId: 'rec-1', totalScore: 100 });
    expect(findInvoiceIdsByReceivableIds).toHaveBeenCalledWith(['rec-1']);
    expect(findByIds).toHaveBeenCalledWith(['inv-1']);
  });

  it('resolves the customer via an exact reference code in transferContent when the bank account is unregistered', async () => {
    const findOpenByCustomerId = jest.fn().mockResolvedValue([receivable]);
    const findInvoiceIdsByReceivableIds = jest
      .fn()
      .mockResolvedValue(new Map([['rec-1', 'inv-1']]));
    const findByIds = jest
      .fn()
      .mockResolvedValue(
        new Map([['inv-1', { invoiceNumber: 'INV-2026-0012' }]]),
      );
    const service = new MatchingEngineService(
      {
        findByAccountNumber: jest.fn().mockResolvedValue(null),
        save: jest.fn(),
      },
      {
        findOpenByCustomerId,
        findOpenTopNByOrganization: jest.fn().mockResolvedValue([receivable]),
        findById: jest.fn(),
        findByIdForUpdate: jest.fn(),
        findInvoiceIdsByReceivableIds,
        save: jest.fn(),
      },
      {
        findByIds,
        findById: jest.fn(),
        save: jest.fn(),
      },
      {
        findNameById: jest.fn().mockResolvedValue('Company B'),
        findById: jest.fn(),
        save: jest.fn(),
      },
    );

    const [candidate] = await service.scoreCandidates(transaction, 'org-1');

    expect(findOpenByCustomerId).toHaveBeenCalledWith('cust-1');
    expect(findInvoiceIdsByReceivableIds).toHaveBeenCalledTimes(2);
    expect(findByIds).toHaveBeenCalledTimes(2);
    expect(candidate).toMatchObject({
      receivableId: 'rec-1',
      referenceCodeScore: 60,
      payerNameScore: 5,
      timingScore: 5,
      customerBankAccountScore: 0,
    });
  });
});
