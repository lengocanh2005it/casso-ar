import { ErrorCode } from '../../../common/errors/error-code';
import { RequestOwnershipTransferUseCase } from './request-ownership-transfer.usecase';

const manager = { name: 'transaction-manager' };
const dataSource = {
  transaction: jest.fn(
    async (callback: (value: typeof manager) => Promise<unknown>) =>
      callback(manager),
  ),
};

function buildUser(overrides: Partial<{ id: string; email: string; passwordHash: string }> = {}) {
  return {
    id: 'owner-1',
    email: 'owner@acme.vn',
    passwordHash: 'hashed-correct-password',
    ...overrides,
  };
}

function buildMembership(
  overrides: Partial<{ role: string; joinedAt: Date | null; status: string }> = {},
) {
  return {
    role: 'ACCOUNTANT',
    joinedAt: new Date('2026-08-01'),
    status: 'ACTIVE',
    isActive: () => overrides.joinedAt !== null,
    isBlocked: () => overrides.status === 'BLOCKED',
    ...overrides,
  };
}

jest.mock('./password-hasher', () => ({
  comparePassword: jest.fn(),
}));

import { comparePassword } from './password-hasher';

function buildUseCase(overrides: {
  userRepo?: Record<string, jest.Mock>;
  membershipRepo?: Record<string, jest.Mock>;
  requestRepo?: Record<string, jest.Mock>;
  notificationSender?: Record<string, jest.Mock>;
} = {}) {
  const userRepo = {
    findById: jest.fn().mockResolvedValue(buildUser()),
    ...overrides.userRepo,
  };
  const membershipRepo = {
    findByUserAndOrganization: jest.fn().mockResolvedValue(
      buildMembership({ joinedAt: new Date('2026-08-01') }),
    ),
    ...overrides.membershipRepo,
  };
  const requestRepo = {
    findNonTerminalByOrganization: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    ...overrides.requestRepo,
  };
  const notificationSender = {
    sendOwnershipTransferOtpEmail: jest.fn(),
    ...overrides.notificationSender,
  };
  return {
    useCase: new RequestOwnershipTransferUseCase(
      requestRepo as never,
      membershipRepo as never,
      userRepo as never,
      notificationSender as never,
      dataSource as never,
    ),
    userRepo,
    membershipRepo,
    requestRepo,
    notificationSender,
  };
}

describe('RequestOwnershipTransferUseCase', () => {
  beforeEach(() => {
    (comparePassword as jest.Mock).mockResolvedValue(true);
  });

  it('creates a PENDING_OTP_CONFIRMATION request and emails the OTP', async () => {
    const { useCase, requestRepo, notificationSender } = buildUseCase();

    const result = await useCase.execute({
      organizationId: 'org-1',
      requestedByUserId: 'owner-1',
      targetUserId: 'target-1',
      currentPassword: 'correct-password',
    });

    expect(result.status).toBe('PENDING_OTP_CONFIRMATION');
    expect(result.fromUserId).toBe('owner-1');
    expect(result.toUserId).toBe('target-1');
    expect(requestRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING_OTP_CONFIRMATION' }),
      manager,
    );
    expect(notificationSender.sendOwnershipTransferOtpEmail).toHaveBeenCalledWith(
      'owner@acme.vn',
      expect.stringMatching(/^\d{6}$/),
    );
  });

  it('rejects targeting yourself', async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestedByUserId: 'owner-1',
        targetUserId: 'owner-1',
        currentPassword: 'correct-password',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
  });

  it('rejects an incorrect current password', async () => {
    (comparePassword as jest.Mock).mockResolvedValue(false);
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestedByUserId: 'owner-1',
        targetUserId: 'target-1',
        currentPassword: 'wrong-password',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
  });

  it('rejects a target who is already OWNER', async () => {
    const { useCase } = buildUseCase({
      membershipRepo: {
        findByUserAndOrganization: jest
          .fn()
          .mockResolvedValue(buildMembership({ role: 'OWNER', joinedAt: new Date('2026-08-01') })),
      },
    });

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestedByUserId: 'owner-1',
        targetUserId: 'target-1',
        currentPassword: 'correct-password',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
  });

  it('rejects when another non-terminal request already exists', async () => {
    const { useCase } = buildUseCase({
      requestRepo: {
        findNonTerminalByOrganization: jest.fn().mockResolvedValue(
          { isExpired: () => false, isNonTerminal: () => true },
        ),
        save: jest.fn(),
      },
    });

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestedByUserId: 'owner-1',
        targetUserId: 'target-1',
        currentPassword: 'correct-password',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
  });
});
