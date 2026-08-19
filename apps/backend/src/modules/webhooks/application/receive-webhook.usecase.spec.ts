import { ReceiveWebhookUseCase } from './receive-webhook.usecase';
import { DuplicateWebhookError } from './webhook-inbox-repository.port';

const input = {
  grantId: 'grant-1',
  transactionId: 'TX-1',
  rawPayload: {
    grantId: 'grant-1',
    transaction: { id: 'TX-1', amount: 1_000 },
  },
};

describe('ReceiveWebhookUseCase', () => {
  it('returns duplicate without enqueueing a webhook already protected by the unique key', async () => {
    const inboxRepo = {
      insert: jest.fn().mockRejectedValue(new DuplicateWebhookError('TX-1')),
    };
    const connectionRepo = {
      findByGrantId: jest.fn().mockResolvedValue({
        organizationId: 'org-1',
        id: 'conn-1',
        isUsable: () => true,
      }),
    };
    const queue = { enqueue: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };
    const useCase = new ReceiveWebhookUseCase(
      inboxRepo as any,
      connectionRepo as any,
      queue as any,
      dataSource as any,
    );

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      duplicate: true,
    });
    expect(connectionRepo.findByGrantId).toHaveBeenCalledWith('grant-1');
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('returns received: true, ignored: true when no connection matches the grantId', async () => {
    const inboxRepo = { insert: jest.fn() };
    const connectionRepo = { findByGrantId: jest.fn().mockResolvedValue(null) };
    const queue = { enqueue: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };
    const useCase = new ReceiveWebhookUseCase(
      inboxRepo as any,
      connectionRepo as any,
      queue as any,
      dataSource as any,
    );

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      ignored: true,
    });
    expect(inboxRepo.insert).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('rejects a tenant-mismatched organizationId even when the connection is inactive', async () => {
    const inboxRepo = { insert: jest.fn() };
    const connectionRepo = {
      findByGrantId: jest.fn().mockResolvedValue({
        organizationId: 'org-1',
        id: 'conn-1',
        isUsable: () => false,
      }),
    };
    const queue = { enqueue: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };
    const useCase = new ReceiveWebhookUseCase(
      inboxRepo as any,
      connectionRepo as any,
      queue as any,
      dataSource as any,
    );

    await expect(
      useCase.execute({ ...input, organizationId: 'other-org' }),
    ).rejects.toMatchObject({ errorCode: 'TENANT_MISMATCH' });
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(inboxRepo.insert).not.toHaveBeenCalled();
  });

  it('still returns ignored for an inactive connection when the tenant matches', async () => {
    const inboxRepo = { insert: jest.fn() };
    const connectionRepo = {
      findByGrantId: jest.fn().mockResolvedValue({
        organizationId: 'org-1',
        id: 'conn-1',
        isUsable: () => false,
      }),
    };
    const queue = { enqueue: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };
    const useCase = new ReceiveWebhookUseCase(
      inboxRepo as any,
      connectionRepo as any,
      queue as any,
      dataSource as any,
    );

    await expect(
      useCase.execute({ ...input, organizationId: 'org-1' }),
    ).resolves.toEqual({ received: true, ignored: true });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
