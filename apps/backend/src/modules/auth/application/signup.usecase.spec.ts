import { Logger } from '@nestjs/common';
import { PendingSignup } from '../domain/pending-signup';
import { SignupUseCase } from './signup.usecase';

function buildTaxCodeMatchMocks(matchedName: string | null) {
  return {
    taxCodeLookup: {
      lookup: jest
        .fn()
        .mockResolvedValue(matchedName === null ? null : { name: matchedName }),
    },
  };
}

function buildCommonMocks() {
  return {
    userRepo: { findByEmail: jest.fn().mockResolvedValue(null) },
    organizationRepo: { findByTaxCode: jest.fn().mockResolvedValue(null) },
    pendingSignupRepo: {
      findByEmail: jest.fn().mockResolvedValue(null),
      findByTaxCode: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      delete: jest.fn(),
    },
    emailSender: { sendVerificationEmail: jest.fn() },
    dataSource: {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) => callback({}),
      ),
    },
  };
}

function buildUseCase(
  common: ReturnType<typeof buildCommonMocks>,
  taxCodeLookup: unknown,
) {
  return new SignupUseCase(
    common.userRepo as any,
    common.organizationRepo as any,
    common.pendingSignupRepo as any,
    common.emailSender as any,
    taxCodeLookup as any,
    common.dataSource as any,
  );
}

function buildExistingPendingSignup(
  overrides: Partial<ConstructorParameters<typeof PendingSignup>[0]> = {},
) {
  return new PendingSignup({
    id: 'pending-1',
    email: 'an@acme.vn',
    passwordHash: 'h',
    name: 'An',
    organizationName: 'Acme Co',
    taxCode: '0101234567',
    taxCodeMatched: true,
    taxCodeLookupName: 'Acme Co',
    otpHash: 'hash',
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    ...overrides,
  });
}

describe('SignupUseCase', () => {
  it('creates a PendingSignup and emails the OTP, without creating a User or Organization', async () => {
    const common = buildCommonMocks();
    const { taxCodeLookup } = buildTaxCodeMatchMocks('Company B');
    const useCase = buildUseCase(common, taxCodeLookup);

    const result = await useCase.execute({
      organizationName: 'Company B',
      name: 'An',
      email: 'AP@congtyb.vn',
      password: 'S3curePass!',
      taxCode: '0101234567',
    });

    expect(result).toEqual({ email: 'ap@congtyb.vn' });
    expect(common.pendingSignupRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ap@congtyb.vn',
        name: 'An',
        organizationName: 'Company B',
        taxCode: '0101234567',
        taxCodeMatched: true,
        taxCodeLookupName: 'Company B',
      }),
      expect.anything(),
    );
    expect(common.emailSender.sendVerificationEmail).toHaveBeenCalledWith(
      'ap@congtyb.vn',
      expect.stringMatching(/^\d{6}$/),
    );
  });

  it('stores taxCodeMatched=false when the name does not match the lookup', async () => {
    const common = buildCommonMocks();
    const { taxCodeLookup } = buildTaxCodeMatchMocks('A Totally Different Co');
    const useCase = buildUseCase(common, taxCodeLookup);

    await useCase.execute({
      organizationName: 'Acme Co',
      name: 'An',
      email: 'an@acme.vn',
      password: 'S3curePass!',
      taxCode: '0101234567',
    });

    expect(common.pendingSignupRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ taxCodeMatched: false }),
      expect.anything(),
    );
  });

  it('stores taxCodeMatched=false and a null lookup name when the lookup fails', async () => {
    const common = buildCommonMocks();
    const { taxCodeLookup } = buildTaxCodeMatchMocks(null);
    const useCase = buildUseCase(common, taxCodeLookup);

    await useCase.execute({
      organizationName: 'Acme Co',
      name: 'An',
      email: 'an@acme.vn',
      password: 'S3curePass!',
      taxCode: '0101234567',
    });

    expect(common.pendingSignupRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        taxCodeMatched: false,
        taxCodeLookupName: null,
      }),
      expect.anything(),
    );
  });

  it('throws if the email is already registered', async () => {
    const common = buildCommonMocks();
    common.userRepo.findByEmail.mockResolvedValue({ id: 'existing' });
    const { taxCodeLookup } = buildTaxCodeMatchMocks(null);
    const useCase = buildUseCase(common, taxCodeLookup);

    await expect(
      useCase.execute({
        organizationName: 'X',
        name: 'X',
        email: 'dup@x.vn',
        password: 'password',
        taxCode: '0101234567',
      }),
    ).rejects.toMatchObject({ errorCode: 'CONFLICT' });
    expect(common.pendingSignupRepo.save).not.toHaveBeenCalled();
  });

  it('throws if another organization already holds this tax code', async () => {
    const common = buildCommonMocks();
    common.organizationRepo.findByTaxCode.mockResolvedValue({
      id: 'other-org',
    });
    const { taxCodeLookup } = buildTaxCodeMatchMocks('Acme Co');
    const useCase = buildUseCase(common, taxCodeLookup);

    await expect(
      useCase.execute({
        organizationName: 'Acme Co',
        name: 'An',
        email: 'an@acme.vn',
        password: 'S3curePass!',
        taxCode: '0101234567',
      }),
    ).rejects.toMatchObject({
      errorCode: 'CONFLICT',
      details: { rowErrorCode: 'DUPLICATE_TAX_CODE' },
    });
  });

  it('throws CONFLICT when a non-expired PendingSignup already exists for the email', async () => {
    const common = buildCommonMocks();
    common.pendingSignupRepo.findByEmail.mockResolvedValue(
      buildExistingPendingSignup(),
    );
    const { taxCodeLookup } = buildTaxCodeMatchMocks('Acme Co');
    const useCase = buildUseCase(common, taxCodeLookup);

    await expect(
      useCase.execute({
        organizationName: 'Acme Co',
        name: 'An',
        email: 'an@acme.vn',
        password: 'S3curePass!',
        taxCode: '0101234567',
      }),
    ).rejects.toMatchObject({ errorCode: 'CONFLICT' });
    expect(common.pendingSignupRepo.delete).not.toHaveBeenCalled();
    expect(common.pendingSignupRepo.save).not.toHaveBeenCalled();
  });

  it('reclaims (deletes) an expired PendingSignup by email and allows signup to proceed', async () => {
    const common = buildCommonMocks();
    common.pendingSignupRepo.findByEmail.mockResolvedValue(
      buildExistingPendingSignup({
        id: 'pending-expired',
        expiresAt: new Date(Date.now() - 60_000),
      }),
    );
    const { taxCodeLookup } = buildTaxCodeMatchMocks('Acme Co');
    const useCase = buildUseCase(common, taxCodeLookup);

    await useCase.execute({
      organizationName: 'Acme Co',
      name: 'An',
      email: 'an@acme.vn',
      password: 'S3curePass!',
      taxCode: '0101234567',
    });

    expect(common.pendingSignupRepo.delete).toHaveBeenCalledWith(
      'pending-expired',
      expect.anything(),
    );
    expect(common.pendingSignupRepo.save).toHaveBeenCalled();
  });

  it('throws CONFLICT with DUPLICATE_TAX_CODE when a non-expired PendingSignup already exists for the tax code', async () => {
    const common = buildCommonMocks();
    common.pendingSignupRepo.findByTaxCode.mockResolvedValue(
      buildExistingPendingSignup({ id: 'pending-2', email: 'other@acme.vn' }),
    );
    const { taxCodeLookup } = buildTaxCodeMatchMocks('Acme Co');
    const useCase = buildUseCase(common, taxCodeLookup);

    await expect(
      useCase.execute({
        organizationName: 'Acme Co',
        name: 'An',
        email: 'an@acme.vn',
        password: 'S3curePass!',
        taxCode: '0101234567',
      }),
    ).rejects.toMatchObject({
      errorCode: 'CONFLICT',
      details: { rowErrorCode: 'DUPLICATE_TAX_CODE' },
    });
  });

  it('logs a non-secret signup-requested event with email and taxCode', async () => {
    const common = buildCommonMocks();
    const { taxCodeLookup } = buildTaxCodeMatchMocks('Acme Co');
    const useCase = buildUseCase(common, taxCodeLookup);
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    await useCase.execute({
      organizationName: 'Acme Co',
      name: 'An',
      email: 'an@acme.vn',
      password: 'S3curePass!',
      taxCode: '0101234567',
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Signup requested',
        email: 'an@acme.vn',
        taxCode: '0101234567',
      }),
    );
    const loggedPayload = JSON.stringify(logSpy.mock.calls[0][0]);
    expect(loggedPayload).not.toMatch(/S3curePass!/);
    logSpy.mockRestore();
  });
});
