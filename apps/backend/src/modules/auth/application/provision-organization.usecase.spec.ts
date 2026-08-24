import { ProvisionOrganizationUseCase } from './provision-organization.usecase';

function buildDeps() {
  return {
    userRepo: { save: jest.fn() },
    organizationRepo: { save: jest.fn() },
    membershipRepo: { save: jest.fn() },
    subscriptionRepo: { save: jest.fn() },
    organizationBootstrap: { seed: jest.fn() },
  };
}

describe('ProvisionOrganizationUseCase', () => {
  it('creates the organization, user, membership, subscription, and bootstrap inside its own transaction', async () => {
    const deps = buildDeps();
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) => callback({}),
      ),
    };
    const useCase = new ProvisionOrganizationUseCase(
      deps.userRepo as any,
      deps.organizationRepo as any,
      deps.membershipRepo as any,
      deps.subscriptionRepo as any,
      deps.organizationBootstrap as any,
      dataSource as any,
    );

    const result = await useCase.execute({
      name: 'An',
      email: 'an@acme.vn',
      passwordHash: 'hashed',
      organizationName: 'Acme Co',
      taxCode: '0101234567',
      taxCodeMatched: true,
      taxCodeLookupName: 'Acme Co',
    });

    expect(result.organization.name).toBe('Acme Co');
    expect(result.organization.status).toBe('PENDING_REVIEW');
    expect(result.organization.taxCodeMatched).toBe(true);
    expect(result.user.email).toBe('an@acme.vn');
    expect(result.user.passwordHash).toBe('hashed');
    expect(result.membership.role).toBe('OWNER');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(deps.organizationRepo.save).toHaveBeenCalled();
    expect(deps.userRepo.save).toHaveBeenCalled();
    expect(deps.membershipRepo.save).toHaveBeenCalled();
    expect(deps.subscriptionRepo.save).toHaveBeenCalled();
    expect(deps.organizationBootstrap.seed).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
    );
  });

  it('runs inside a caller-supplied manager instead of opening its own transaction', async () => {
    const deps = buildDeps();
    const dataSource = { transaction: jest.fn() };
    const useCase = new ProvisionOrganizationUseCase(
      deps.userRepo as any,
      deps.organizationRepo as any,
      deps.membershipRepo as any,
      deps.subscriptionRepo as any,
      deps.organizationBootstrap as any,
      dataSource as any,
    );
    const externalManager = {} as any;

    await useCase.execute(
      {
        name: 'An',
        email: 'an@acme.vn',
        passwordHash: 'hashed',
        organizationName: 'Acme Co',
        taxCode: '0101234567',
        taxCodeMatched: true,
        taxCodeLookupName: 'Acme Co',
      },
      externalManager,
    );

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(deps.organizationRepo.save).toHaveBeenCalledWith(
      expect.anything(),
      externalManager,
    );
  });
});
