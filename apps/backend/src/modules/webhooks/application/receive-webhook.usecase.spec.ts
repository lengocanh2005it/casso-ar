import { encryptToken } from '../../bank-connections/application/token-encryption';
import { ReceiveWebhookUseCase } from './receive-webhook.usecase';
import { DuplicateWebhookError } from './webhook-inbox-repository.port';

const encryptionKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const realSecret = 'the-real-secret';

const input = {
  accountNumber: '0011002233',
  webhookSecret: realSecret,
  transactionId: 'TX-1',
  rawPayload: { error: 0, data: { id: 'TX-1', amount: 1_000 } },
};

function connectionWith(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1',
    id: 'conn-1',
    isUsable: () => true,
    encryptedSecureToken: encryptToken(realSecret, encryptionKey),
    ...overrides,
  };
}

describe('ReceiveWebhookUseCase', () => {
  it('resolves by accountNumber, verifies the secret, and enqueues', async () => {
    const inboxRepo = { insert: jest.fn() };
    const connectionRepo = {
      findByAccountNumber: jest.fn().mockResolvedValue(connectionWith()),
    };
    const queue = { enqueue: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };
    const useCase = new ReceiveWebhookUseCase(
      inboxRepo as never,
      connectionRepo as never,
      queue as never,
      dataSource as never,
      encryptionKey,
    );

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      duplicate: false,
    });
    expect(connectionRepo.findByAccountNumber).toHaveBeenCalledWith(
      '0011002233',
    );
    expect(queue.enqueue).toHaveBeenCalled();
  });

  it('ignores when accountNumber matches no connection', async () => {
    const connectionRepo = {
      findByAccountNumber: jest.fn().mockResolvedValue(null),
    };
    const useCase = new ReceiveWebhookUseCase(
      { insert: jest.fn() } as never,
      connectionRepo as never,
      { enqueue: jest.fn() } as never,
      { transaction: jest.fn() } as never,
      encryptionKey,
    );

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      ignored: true,
    });
  });

  it('ignores when the secret does not match, without enqueueing', async () => {
    const connectionRepo = {
      findByAccountNumber: jest.fn().mockResolvedValue(
        connectionWith({
          encryptedSecureToken: encryptToken('different-secret', encryptionKey),
        }),
      ),
    };
    const queue = { enqueue: jest.fn() };
    const useCase = new ReceiveWebhookUseCase(
      { insert: jest.fn() } as never,
      connectionRepo as never,
      queue as never,
      { transaction: jest.fn() } as never,
      encryptionKey,
    );

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      ignored: true,
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('returns duplicate without enqueueing a webhook already protected by the unique key', async () => {
    const inboxRepo = {
      insert: jest.fn().mockRejectedValue(new DuplicateWebhookError('TX-1')),
    };
    const connectionRepo = {
      findByAccountNumber: jest.fn().mockResolvedValue(connectionWith()),
    };
    const queue = { enqueue: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };
    const useCase = new ReceiveWebhookUseCase(
      inboxRepo as never,
      connectionRepo as never,
      queue as never,
      dataSource as never,
      encryptionKey,
    );

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      duplicate: true,
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
