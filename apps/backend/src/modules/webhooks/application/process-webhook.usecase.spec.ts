import { WebhookInbox } from '../domain/webhook-inbox';
import { ProcessWebhookUseCase } from './process-webhook.usecase';

const inbox = new WebhookInbox({
  id: 'wh-1',
  organizationId: 'org-1',
  bankConnectionId: 'conn-1',
  providerTransactionId: 'TX-001',
  rawPayload: {
    transactionId: 'TX-001',
    amount: 30_000_000,
    transactionDateTime: '2026-08-05T00:00:00.000Z',
    counterpartyAccountNumber: '0011002233',
    counterpartyName: 'CONG TY B',
    transferContent: 'INV-1',
  },
  receivedAt: new Date(),
  status: 'RECEIVED',
  processedAt: null,
  errorMessage: null,
  retryCount: 0,
});

describe('ProcessWebhookUseCase', () => {
  it('auto-allocates the top candidate at or above ninety', async () => {
    const inboxRepo = {
      findById: jest.fn().mockResolvedValue(inbox),
      save: jest.fn(),
    };
    const transactionRepo = { save: jest.fn(), findById: jest.fn() };
    const engine = {
      scoreCandidates: jest
        .fn()
        .mockResolvedValue([
          { receivableId: 'rec-1', customerId: 'cust-1', totalScore: 95 },
        ]),
      toMatchingCandidateEntities: jest.fn(),
    };
    const paymentRepo = { save: jest.fn(), findByIdForUpdate: jest.fn() };
    const allocation = { allocateWithinTransaction: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };
    const tenant = {
      run: jest.fn((_user: unknown, callback: () => Promise<void>) =>
        callback(),
      ),
    };
    const useCase = new ProcessWebhookUseCase(
      inboxRepo as any,
      transactionRepo as any,
      engine as any,
      { saveMany: jest.fn() } as any,
      paymentRepo as any,
      allocation as any,
      dataSource as any,
      tenant as any,
    );

    await useCase.execute('wh-1', 'org-1');

    expect(allocation.allocateWithinTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        receivableId: 'rec-1',
        amount: 30_000_000,
        allocatedByUserId: null,
      }),
    );
    expect(inboxRepo.save).toHaveBeenCalled();
  });
});
