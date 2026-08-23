import { ErrorCode } from '../../../common/errors/error-code';
import { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';
import { ConfirmOwnershipTransferUseCase } from './confirm-ownership-transfer.usecase';
import { hashOtp } from './token-hasher';

const manager = { name: 'transaction-manager' };
const dataSource = {
  transaction: jest.fn(
    async (callback: (value: typeof manager) => Promise<unknown>) =>
      callback(manager),
  ),
};

function buildRequest(
  overrides: Partial<ConstructorParameters<typeof OwnershipTransferRequest>[0]> = {},
) {
  return new OwnershipTransferRequest({
    id: 'req-1',
    organizationId: 'org-1',
    fromUserId: 'owner-1',
    toUserId: 'target-1',
    status: 'PENDING_OTP_CONFIRMATION',
    otpHash: hashOtp('123456'),
    otpExpiresAt: new Date('2100-01-01T00:00:00.000Z'),
    acceptanceExpiresAt: null,
    resolvedAt: null,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
    ...overrides,
  });
}

function buildUseCase(overrides: {
  requestRepo?: Record<string, jest.Mock>;
  userRepo?: Record<string, jest.Mock>;
  organizationRepo?: Record<string, jest.Mock>;
  notificationSender?: Record<string, jest.Mock>;
} = {}) {
  const requestRepo = {
    findById: jest.fn().mockResolvedValue(buildRequest()),
    save: jest.fn(),
    ...overrides.requestRepo,
  };
  const userRepo = {
    findById: jest.fn().mockResolvedValue({ id: 'target-1', email: 'target@acme.vn' }),
    ...overrides.userRepo,
  };
  const organizationRepo = {
    findById: jest.fn().mockResolvedValue({ id: 'org-1', name: 'Acme Corp' }),
    ...overrides.organizationRepo,
  };
  const notificationSender = {
    sendOwnershipTransferPendingEmail: jest.fn(),
    ...overrides.notificationSender,
  };
  return {
    useCase: new ConfirmOwnershipTransferUseCase(
      requestRepo as never,
      userRepo as never,
      organizationRepo as never,
      notificationSender as never,
      dataSource as never,
    ),
    requestRepo,
    userRepo,
    organizationRepo,
    notificationSender,
  };
}

describe('ConfirmOwnershipTransferUseCase', () => {
  it('moves the request to PENDING_ACCEPTANCE and emails the target', async () => {
    const { useCase, requestRepo, notificationSender } = buildUseCase();

    const result = await useCase.execute({
      organizationId: 'org-1',
      requestId: 'req-1',
      requestedByUserId: 'owner-1',
      otp: '123456',
    });

    expect(result.status).toBe('PENDING_ACCEPTANCE');
    expect(result.acceptanceExpiresAt).not.toBeNull();
    expect(requestRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING_ACCEPTANCE' }),
      manager,
    );
    expect(notificationSender.sendOwnershipTransferPendingEmail).toHaveBeenCalledWith(
      'target@acme.vn',
      'Acme Corp',
    );
  });

  it('rejects a wrong OTP', async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestId: 'req-1',
        requestedByUserId: 'owner-1',
        otp: '000000',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.UNAUTHORIZED });
  });

  it('rejects an actor who did not create the request', async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestId: 'req-1',
        requestedByUserId: 'someone-else',
        otp: '123456',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.FORBIDDEN });
  });

  it('rejects confirming a request that already left PENDING_OTP_CONFIRMATION', async () => {
    const { useCase } = buildUseCase({
      requestRepo: {
        findById: jest
          .fn()
          .mockResolvedValue(buildRequest({ status: 'PENDING_ACCEPTANCE' })),
        save: jest.fn(),
      },
    });

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestId: 'req-1',
        requestedByUserId: 'owner-1',
        otp: '123456',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
  });
});
