import { ErrorCode } from '../../../common/errors/error-code';
import { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';
import { CancelOwnershipTransferUseCase } from './cancel-ownership-transfer.usecase';

const manager = { name: 'transaction-manager' };
const dataSource = {
  transaction: jest.fn(
    async (callback: (value: typeof manager) => Promise<unknown>) =>
      callback(manager),
  ),
};

function buildRequest(
  overrides: Partial<
    ConstructorParameters<typeof OwnershipTransferRequest>[0]
  > = {},
) {
  return new OwnershipTransferRequest({
    id: 'req-1',
    organizationId: 'org-1',
    fromUserId: 'owner-1',
    toUserId: 'target-1',
    status: 'PENDING_ACCEPTANCE',
    otpHash: 'hash-1',
    otpExpiresAt: new Date('2026-08-23T00:05:00.000Z'),
    acceptanceExpiresAt: new Date(Date.now() + 60_000),
    resolvedAt: null,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
    ...overrides,
  });
}

function buildUseCase(requestRepoOverrides: Record<string, jest.Mock> = {}) {
  const requestRepo = {
    findById: jest.fn().mockResolvedValue(buildRequest()),
    save: jest.fn(),
    ...requestRepoOverrides,
  };
  return {
    useCase: new CancelOwnershipTransferUseCase(
      requestRepo as never,
      dataSource as never,
    ),
    requestRepo,
  };
}

describe('CancelOwnershipTransferUseCase', () => {
  it('cancels a non-terminal request created by the caller', async () => {
    const { useCase, requestRepo } = buildUseCase();

    const result = await useCase.execute({
      organizationId: 'org-1',
      requestId: 'req-1',
      requestedByUserId: 'owner-1',
    });

    expect(result.status).toBe('CANCELLED');
    expect(requestRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CANCELLED' }),
      manager,
    );
  });

  it('rejects an actor who did not create the request', async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestId: 'req-1',
        requestedByUserId: 'someone-else',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.FORBIDDEN });
  });

  it('rejects cancelling an already-terminal request', async () => {
    const { useCase } = buildUseCase({
      findById: jest
        .fn()
        .mockResolvedValue(buildRequest({ status: 'ACCEPTED' })),
      save: jest.fn(),
    });

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestId: 'req-1',
        requestedByUserId: 'owner-1',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
  });
});
