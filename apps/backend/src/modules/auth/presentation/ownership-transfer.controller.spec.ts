import { OwnershipTransferController } from './ownership-transfer.controller';

function buildController() {
  const requestUseCase = { execute: jest.fn() };
  const confirmUseCase = { execute: jest.fn() };
  const cancelUseCase = { execute: jest.fn() };
  const acceptUseCase = { execute: jest.fn() };
  const declineUseCase = { execute: jest.fn() };
  const getCurrentUseCase = { execute: jest.fn() };
  const getPendingForMeUseCase = { execute: jest.fn() };
  const idempotency = {
    execute: jest.fn(
      (
        _endpoint: string,
        _key: unknown,
        _input: unknown,
        operation: () => unknown,
      ) => operation(),
    ),
  };
  const controller = new OwnershipTransferController(
    requestUseCase as never,
    confirmUseCase as never,
    cancelUseCase as never,
    acceptUseCase as never,
    declineUseCase as never,
    getCurrentUseCase as never,
    getPendingForMeUseCase as never,
    idempotency as never,
  );
  return {
    controller,
    requestUseCase,
    confirmUseCase,
    cancelUseCase,
    acceptUseCase,
    declineUseCase,
    getCurrentUseCase,
    getPendingForMeUseCase,
    idempotency,
  };
}

function buildRequest(
  overrides: { userId?: string; organizationId?: string } = {},
) {
  return {
    user: {
      userId: overrides.userId ?? 'user-1',
      organizationId: overrides.organizationId ?? 'org-1',
    },
  } as never;
}

describe('OwnershipTransferController', () => {
  it('allows a request whose JWT organizationId matches the route :id', async () => {
    const { controller, requestUseCase } = buildController();
    requestUseCase.execute.mockResolvedValue({
      id: 'req-1',
      status: 'PENDING_OTP_CONFIRMATION',
      fromUserId: 'user-1',
      toUserId: 'user-2',
      acceptanceExpiresAt: null,
      createdAt: new Date('2026-08-23T00:00:00.000Z'),
    });

    const result = await controller.request(
      'org-1',
      { targetUserId: 'user-2', currentPassword: 'secret' },
      buildRequest({ organizationId: 'org-1' }),
      undefined,
    );

    expect(result.id).toBe('req-1');
    expect(requestUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        requestedByUserId: 'user-1',
      }),
    );
  });

  it('rejects a request whose JWT organizationId does not match the route :id', async () => {
    const { controller } = buildController();

    await expect(
      controller.request(
        'org-1',
        { targetUserId: 'user-2', currentPassword: 'secret' },
        buildRequest({ organizationId: 'org-999' }),
        undefined,
      ),
    ).rejects.toThrow();
  });

  it('allows accept for a request whose JWT organizationId matches the route :id', async () => {
    const { controller, acceptUseCase } = buildController();
    acceptUseCase.execute.mockResolvedValue({
      id: 'req-1',
      status: 'ACCEPTED',
      fromUserId: 'user-1',
      toUserId: 'user-2',
      acceptanceExpiresAt: null,
      createdAt: new Date('2026-08-23T00:00:00.000Z'),
    });

    const result = await controller.accept(
      'org-1',
      'req-1',
      buildRequest({ userId: 'user-2', organizationId: 'org-1' }),
      undefined,
    );

    expect(result.status).toBe('ACCEPTED');
  });
});
