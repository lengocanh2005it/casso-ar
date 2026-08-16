import { ErrorCode } from '../../../common/errors/error-code';
import { decryptToken } from '../../bank-connections/application/token-encryption';
import { SmtpConfigStatus } from '../domain/organization-smtp-config';
import { TestAndSaveSmtpConfigUseCase } from './test-and-save-smtp-config.usecase';

function buildDeps() {
  return {
    smtpConfigRepo: { save: jest.fn() },
    subscriptionRepo: {
      findByOrganizationId: jest.fn().mockResolvedValue({
        canUseCustomSmtp: true,
      }),
    },
    membershipRepo: {
      findOwnerByOrganization: jest.fn().mockResolvedValue({
        userId: 'user-owner',
      }),
    },
    userRepo: {
      findById: jest.fn().mockResolvedValue({ email: 'owner@congtyb.vn' }),
    },
    tenantContext: { getOrganizationId: jest.fn().mockReturnValue('org-1') },
    smtpHostResolver: {
      resolve: jest.fn().mockResolvedValue(['93.184.216.34']),
    },
    transportFactory: jest.fn(),
    encryptionKey: 'a'.repeat(64),
    logger: { error: jest.fn() },
  };
}

const input = {
  host: '93.184.216.34',
  port: 587,
  username: 'noreply@congtyb.vn',
  password: 'app-password',
  fromAddress: 'noreply@congtyb.vn',
};

describe('TestAndSaveSmtpConfigUseCase', () => {
  it('verifies + sends a test email, then persists with status CONNECTED', async () => {
    const deps = buildDeps();
    const transport = {
      verify: jest.fn().mockResolvedValue(true),
      sendMail: jest.fn().mockResolvedValue({}),
    };
    deps.transportFactory.mockReturnValue(transport);

    const useCase = new TestAndSaveSmtpConfigUseCase(
      deps.smtpConfigRepo as any,
      deps.subscriptionRepo as any,
      deps.membershipRepo as any,
      deps.userRepo as any,
      deps.tenantContext as any,
      deps.transportFactory,
      deps.encryptionKey,
      deps.logger as any,
      deps.smtpHostResolver as any,
    );

    const config = await useCase.execute(input);

    expect(transport.verify).toHaveBeenCalled();
    expect(deps.transportFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionTimeout: 10_000,
        socketTimeout: 30_000,
        greetingTimeout: 10_000,
      }),
    );
    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@congtyb.vn',
        to: 'owner@congtyb.vn',
      }),
    );
    expect(deps.smtpConfigRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: SmtpConfigStatus.CONNECTED,
        host: '93.184.216.34',
      }),
    );
    const savedConfig = deps.smtpConfigRepo.save.mock.calls[0][0];
    expect(savedConfig.encryptedPassword).not.toBe(input.password);
    expect(
      decryptToken(savedConfig.encryptedPassword, deps.encryptionKey),
    ).toBe(input.password);
    expect(config.status).toBe(SmtpConfigStatus.CONNECTED);
  });

  it('never persists when verify() throws — AppError(SMTP_CONNECTION_FAILED)', async () => {
    const deps = buildDeps();
    const transport = {
      verify: jest.fn().mockRejectedValue(new Error('auth rejected')),
      sendMail: jest.fn(),
    };
    deps.transportFactory.mockReturnValue(transport);

    const useCase = new TestAndSaveSmtpConfigUseCase(
      deps.smtpConfigRepo as any,
      deps.subscriptionRepo as any,
      deps.membershipRepo as any,
      deps.userRepo as any,
      deps.tenantContext as any,
      deps.transportFactory,
      deps.encryptionKey,
      deps.logger as any,
      deps.smtpHostResolver as any,
    );

    const original = new Error('auth rejected');
    transport.verify.mockRejectedValue(original);

    await expect(useCase.execute(input)).rejects.toMatchObject({
      errorCode: ErrorCode.SMTP_CONNECTION_FAILED,
      message: 'Không thể kết nối hoặc gửi email thử.',
      cause: original,
    });
    expect(deps.smtpConfigRepo.save).not.toHaveBeenCalled();
  });

  it('never persists when sendMail() throws — AppError(SMTP_CONNECTION_FAILED)', async () => {
    const deps = buildDeps();
    const transport = {
      verify: jest.fn().mockResolvedValue(true),
      sendMail: jest.fn().mockRejectedValue(new Error('connection refused')),
    };
    deps.transportFactory.mockReturnValue(transport);

    const useCase = new TestAndSaveSmtpConfigUseCase(
      deps.smtpConfigRepo as any,
      deps.subscriptionRepo as any,
      deps.membershipRepo as any,
      deps.userRepo as any,
      deps.tenantContext as any,
      deps.transportFactory,
      deps.encryptionKey,
      deps.logger as any,
      deps.smtpHostResolver as any,
    );

    await expect(useCase.execute(input)).rejects.toMatchObject({
      errorCode: ErrorCode.SMTP_CONNECTION_FAILED,
      message: 'Không thể kết nối hoặc gửi email thử.',
    });
    expect(deps.smtpConfigRepo.save).not.toHaveBeenCalled();
  });

  it('throws FORBIDDEN when the org plan does not allow custom SMTP', async () => {
    const deps = buildDeps();
    deps.subscriptionRepo.findByOrganizationId.mockResolvedValue({
      canUseCustomSmtp: false,
    });

    const useCase = new TestAndSaveSmtpConfigUseCase(
      deps.smtpConfigRepo as any,
      deps.subscriptionRepo as any,
      deps.membershipRepo as any,
      deps.userRepo as any,
      deps.tenantContext as any,
      deps.transportFactory,
      deps.encryptionKey,
      deps.logger as any,
      deps.smtpHostResolver as any,
    );

    await expect(useCase.execute(input)).rejects.toThrow();
    expect(deps.transportFactory).not.toHaveBeenCalled();
    expect(deps.smtpConfigRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a private SMTP host before creating a transport', async () => {
    const deps = buildDeps();
    const useCase = new TestAndSaveSmtpConfigUseCase(
      deps.smtpConfigRepo as any,
      deps.subscriptionRepo as any,
      deps.membershipRepo as any,
      deps.userRepo as any,
      deps.tenantContext as any,
      deps.transportFactory,
      deps.encryptionKey,
      deps.logger as any,
      deps.smtpHostResolver as any,
    );

    await expect(
      useCase.execute({ ...input, host: '127.0.0.1' }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.SMTP_CONNECTION_FAILED,
      message: 'Không thể kết nối hoặc gửi email thử.',
    });
    expect(deps.transportFactory).not.toHaveBeenCalled();
  });

  it('connects to the validated DNS address and keeps the hostname for TLS', async () => {
    const deps = buildDeps();
    const transport = {
      verify: jest.fn().mockResolvedValue(true),
      sendMail: jest.fn().mockResolvedValue({}),
    };
    deps.transportFactory.mockReturnValue(transport);
    deps.smtpHostResolver.resolve.mockResolvedValue(['93.184.216.34']);

    const useCase = new TestAndSaveSmtpConfigUseCase(
      deps.smtpConfigRepo as any,
      deps.subscriptionRepo as any,
      deps.membershipRepo as any,
      deps.userRepo as any,
      deps.tenantContext as any,
      deps.transportFactory,
      deps.encryptionKey,
      deps.logger as any,
      deps.smtpHostResolver as any,
    );

    await useCase.execute({ ...input, host: 'smtp.example.com' });

    expect(deps.smtpHostResolver.resolve).toHaveBeenCalledWith(
      'smtp.example.com',
    );
    expect(deps.transportFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '93.184.216.34',
        serverName: 'smtp.example.com',
      }),
    );
  });
});
