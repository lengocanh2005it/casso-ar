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

describe('SignupUseCase', () => {
  it('creates the organization bootstrap and verification token before emailing it', async () => {
    const userRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const organizationRepo = {
      findByTaxCode: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const membershipRepo = { save: jest.fn() };
    const verificationTokenRepo = { save: jest.fn() };
    const subscriptionRepo = { save: jest.fn() };
    const organizationBootstrap = { seed: jest.fn() };
    const emailSender = { sendVerificationEmail: jest.fn() };
    const { taxCodeLookup } = buildTaxCodeMatchMocks('Company B');
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };

    const useCase = new SignupUseCase(
      userRepo as any,
      organizationRepo as any,
      membershipRepo as any,
      verificationTokenRepo as any,
      subscriptionRepo as any,
      organizationBootstrap as any,
      emailSender as any,
      taxCodeLookup as any,
      dataSource as any,
    );

    const result = await useCase.execute({
      organizationName: 'Company B',
      name: 'An',
      email: 'AP@congtyb.vn',
      password: 'S3curePass!',
      taxCode: '0101234567',
    });

    expect(result.organization.name).toBe('Company B');
    expect(result.membership.role).toBe('OWNER');
    expect(userRepo.save).toHaveBeenCalled();
    expect(organizationRepo.save).toHaveBeenCalled();
    expect(membershipRepo.save).toHaveBeenCalled();
    expect(subscriptionRepo.save).toHaveBeenCalled();
    expect(organizationBootstrap.seed).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
    );
    expect(verificationTokenRepo.save).toHaveBeenCalled();
    expect(emailSender.sendVerificationEmail).toHaveBeenCalledWith(
      'ap@congtyb.vn',
      expect.stringMatching(/^\d{6}$/),
    );
  });

  it('throws if the email is already registered', async () => {
    const userRepo = {
      findByEmail: jest.fn().mockResolvedValue({ id: 'existing' }),
      save: jest.fn(),
    };
    const { taxCodeLookup } = buildTaxCodeMatchMocks(null);
    const useCase = new SignupUseCase(
      userRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      taxCodeLookup as any,
      {} as any,
    );

    await expect(
      useCase.execute({
        organizationName: 'X',
        name: 'X',
        email: 'dup@x.vn',
        password: 'password',
        taxCode: '0101234567',
      }),
    ).rejects.toMatchObject({
      errorCode: 'CONFLICT',
    });
  });

  it('throws if another organization already holds this tax code', async () => {
    const userRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const organizationRepo = {
      findByTaxCode: jest.fn().mockResolvedValue({ id: 'other-org' }),
      save: jest.fn(),
    };
    const { taxCodeLookup } = buildTaxCodeMatchMocks('Acme Co');
    const useCase = new SignupUseCase(
      userRepo as any,
      organizationRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      taxCodeLookup as any,
      {} as any,
    );

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
});

describe('SignupUseCase tax code verification', () => {
  function buildCommonMocks() {
    const userRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const organizationRepo = {
      findByTaxCode: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const membershipRepo = { save: jest.fn() };
    const verificationTokenRepo = { save: jest.fn() };
    const subscriptionRepo = { save: jest.fn() };
    const organizationBootstrap = { seed: jest.fn() };
    const emailSender = { sendVerificationEmail: jest.fn() };
    const dataSource = {
      transaction: jest.fn((cb) => cb({})),
    };
    return {
      userRepo,
      organizationRepo,
      membershipRepo,
      verificationTokenRepo,
      subscriptionRepo,
      organizationBootstrap,
      emailSender,
      dataSource,
    };
  }

  it('creates a PENDING_REVIEW organization even when the tax code matches', async () => {
    const common = buildCommonMocks();
    const { taxCodeLookup } = buildTaxCodeMatchMocks('ACME CO');
    const useCase = new SignupUseCase(
      common.userRepo as any,
      common.organizationRepo as any,
      common.membershipRepo as any,
      common.verificationTokenRepo as any,
      common.subscriptionRepo as any,
      common.organizationBootstrap as any,
      common.emailSender as any,
      taxCodeLookup as any,
      common.dataSource as any,
    );

    const result = await useCase.execute({
      organizationName: 'Acme Co',
      name: 'An',
      email: 'an@acme.vn',
      password: 'S3curePass!',
      taxCode: '0101234567',
    });

    expect(result.organization.status).toBe('PENDING_REVIEW');
    expect(result.organization.taxCodeMatched).toBe(true);
  });

  it('creates a PENDING_REVIEW organization when the tax code does not match', async () => {
    const common = buildCommonMocks();
    const { taxCodeLookup } = buildTaxCodeMatchMocks('A Totally Different Co');
    const useCase = new SignupUseCase(
      common.userRepo as any,
      common.organizationRepo as any,
      common.membershipRepo as any,
      common.verificationTokenRepo as any,
      common.subscriptionRepo as any,
      common.organizationBootstrap as any,
      common.emailSender as any,
      taxCodeLookup as any,
      common.dataSource as any,
    );

    const result = await useCase.execute({
      organizationName: 'Acme Co',
      name: 'An',
      email: 'an@acme.vn',
      password: 'S3curePass!',
      taxCode: '0101234567',
    });

    expect(result.organization.status).toBe('PENDING_REVIEW');
  });

  it('creates a PENDING_REVIEW organization when the lookup fails', async () => {
    const common = buildCommonMocks();
    const { taxCodeLookup } = buildTaxCodeMatchMocks(null);
    const useCase = new SignupUseCase(
      common.userRepo as any,
      common.organizationRepo as any,
      common.membershipRepo as any,
      common.verificationTokenRepo as any,
      common.subscriptionRepo as any,
      common.organizationBootstrap as any,
      common.emailSender as any,
      taxCodeLookup as any,
      common.dataSource as any,
    );

    const result = await useCase.execute({
      organizationName: 'Acme Co',
      name: 'An',
      email: 'an@acme.vn',
      password: 'S3curePass!',
      taxCode: '0101234567',
    });

    expect(result.organization.status).toBe('PENDING_REVIEW');
  });
});
