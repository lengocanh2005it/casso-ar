import { Role } from '@casso-ar/shared-types';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { GetUserProfileUseCase } from './get-user-profile.usecase';

describe('GetUserProfileUseCase', () => {
  function buildDeps() {
    const userRepo = {
      findById: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'owner@casso.vn',
        name: 'Owner',
      }),
    };
    const subscriptionRepo = {
      findByOrganizationId: jest.fn().mockResolvedValue({ planId: 'STARTER' }),
    };
    const membershipRepo = {
      findByUserAndOrganization: jest
        .fn()
        .mockResolvedValue({ role: Role.OWNER, isActive: () => true }),
    };
    const organizationRepo = {
      findById: jest.fn().mockResolvedValue({
        id: 'org-1',
        name: 'Casso Ledger',
      }),
    };
    const bankConnectionRepo = {
      hasActiveByOrganization: jest.fn().mockResolvedValue(true),
    };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    return {
      userRepo,
      subscriptionRepo,
      membershipRepo,
      organizationRepo,
      bankConnectionRepo,
      tenantContext,
    };
  }

  function createUseCase(deps: ReturnType<typeof buildDeps>) {
    return new (GetUserProfileUseCase as any)(
      deps.userRepo as any,
      deps.subscriptionRepo as any,
      deps.membershipRepo as any,
      deps.organizationRepo as any,
      deps.tenantContext as any,
      deps.bankConnectionRepo as any,
    );
  }

  it('returns the profile with role, organization, and subscription plan', async () => {
    const deps = buildDeps();
    const result = await createUseCase(deps).execute('user-1');

    expect(result).toEqual({
      id: 'user-1',
      email: 'owner@casso.vn',
      name: 'Owner',
      organizationId: 'org-1',
      organizationName: 'Casso Ledger',
      role: Role.OWNER,
      subscriptionPlan: 'STARTER',
      bankingLinked: true,
    });
  });

  it('defaults subscriptionPlan to FREE when no subscription row exists', async () => {
    const deps = buildDeps();
    deps.subscriptionRepo.findByOrganizationId.mockResolvedValue(null);

    const result = await createUseCase(deps).execute('user-1');

    expect(result.subscriptionPlan).toBe('FREE');
  });

  it('throws NOT_FOUND when the user does not exist', async () => {
    const deps = buildDeps();
    deps.userRepo.findById.mockResolvedValue(null);

    await expect(createUseCase(deps).execute('missing')).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    } satisfies Partial<AppError>);
  });
});
