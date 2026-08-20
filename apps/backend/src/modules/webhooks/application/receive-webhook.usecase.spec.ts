import { createHmac } from 'node:crypto';
import { ErrorCode } from '../../../common/errors/error-code';
import { encryptToken } from '../../bank-connections/application/token-encryption';
import { ReceiveWebhookUseCase } from './receive-webhook.usecase';
import { DuplicateWebhookError } from './webhook-inbox-repository.port';

const encryptionKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const realSecret = 'the-real-secret';
const signatureTimestamp = '1734924830020';

function sortPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortPayload);
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, sortPayload(record[key])]),
  );
}

function signPayload(payload: Record<string, unknown>, secret: string): string {
  const message = `${signatureTimestamp}.${JSON.stringify(sortPayload(payload))}`;
  const digest = createHmac('sha512', secret).update(message).digest('hex');
  return `t=${signatureTimestamp},v1=${digest}`;
}

const rawPayload = {
  error: 0,
  data: { id: 'TX-1', amount: 1_000 },
};

const input = {
  accountNumber: '0011002233',
  webhookSignature: signPayload(rawPayload, realSecret),
  transactionId: 'TX-1',
  rawPayload,
};

function connectionWith(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1',
    id: 'conn-1',
    cassoFlowAuthorizationId: 'auth-1',
    isUsable: () => true,
    ...overrides,
  };
}

function authorizationWith(overrides: Record<string, unknown> = {}) {
  return {
    id: 'auth-1',
    encryptedSecureToken: encryptToken(realSecret, encryptionKey),
    ...overrides,
  };
}

function buildUseCase(overrides: {
  inboxRepo?: Record<string, jest.Mock>;
  connectionRepo?: Record<string, jest.Mock>;
  authorizationRepo?: Record<string, jest.Mock>;
  queue?: Record<string, jest.Mock>;
  dataSource?: Record<string, jest.Mock>;
}) {
  const inboxRepo = { insert: jest.fn(), ...overrides.inboxRepo };
  const connectionRepo = {
    findByAccountNumber: jest.fn().mockResolvedValue(connectionWith()),
    ...overrides.connectionRepo,
  };
  const authorizationRepo = {
    findByIdUnscoped: jest.fn().mockResolvedValue(authorizationWith()),
    ...overrides.authorizationRepo,
  };
  const queue = { enqueue: jest.fn(), ...overrides.queue };
  const dataSource = {
    transaction: jest.fn(async (callback: (manager: object) => Promise<void>) =>
      callback({}),
    ),
    ...overrides.dataSource,
  };
  const useCase = new ReceiveWebhookUseCase(
    inboxRepo as never,
    connectionRepo as never,
    queue as never,
    dataSource as never,
    encryptionKey,
    authorizationRepo as never,
  );
  return { useCase, inboxRepo, connectionRepo, authorizationRepo, queue };
}

describe('ReceiveWebhookUseCase', () => {
  it('resolves by accountNumber, verifies the V2 signature via the authorization, and enqueues', async () => {
    const { useCase, connectionRepo, authorizationRepo, queue } = buildUseCase(
      {},
    );

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      duplicate: false,
    });
    expect(connectionRepo.findByAccountNumber).toHaveBeenCalledWith(
      '0011002233',
    );
    expect(authorizationRepo.findByIdUnscoped).toHaveBeenCalledWith('auth-1');
    expect(queue.enqueue).toHaveBeenCalled();
  });

  it('ignores when accountNumber matches no connection', async () => {
    const { useCase } = buildUseCase({
      connectionRepo: {
        findByAccountNumber: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      ignored: true,
    });
  });

  it('ignores when the authorization cannot be found', async () => {
    const { useCase, queue } = buildUseCase({
      authorizationRepo: {
        findByIdUnscoped: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      ignored: true,
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('rejects when the V2 signature does not match, without enqueueing', async () => {
    const { useCase, queue } = buildUseCase({
      authorizationRepo: {
        findByIdUnscoped: jest.fn().mockResolvedValue(
          authorizationWith({
            encryptedSecureToken: encryptToken(
              'different-secret',
              encryptionKey,
            ),
          }),
        ),
      },
    });

    await expect(useCase.execute(input)).rejects.toMatchObject({
      errorCode: ErrorCode.UNAUTHORIZED,
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('returns duplicate without enqueueing a webhook already protected by the unique key', async () => {
    const { useCase, queue } = buildUseCase({
      inboxRepo: {
        insert: jest.fn().mockRejectedValue(new DuplicateWebhookError('TX-1')),
      },
    });

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      duplicate: true,
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
