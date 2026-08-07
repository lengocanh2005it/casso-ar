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
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    return { userRepo, subscriptionRepo, tenantContext };
  }

  it('returns the profile with the active subscription plan', async () => {
    const { userRepo, subscriptionRepo, tenantContext } = buildDeps();
    const useCase = new GetUserProfileUseCase(
      userRepo as any,
      subscriptionRepo as any,
      tenantContext as any,
    );

    const result = await useCase.execute('user-1');

    expect(result).toEqual({
      id: 'user-1',
      email: 'owner@casso.vn',
      name: 'Owner',
      organizationId: 'org-1',
      subscriptionPlan: 'STARTER',
    });
  });

  it('defaults subscriptionPlan to FREE when no subscription row exists', async () => {
    const { userRepo, subscriptionRepo, tenantContext } = buildDeps();
    subscriptionRepo.findByOrganizationId.mockResolvedValue(null);
    const useCase = new GetUserProfileUseCase(
      userRepo as any,
      subscriptionRepo as any,
      tenantContext as any,
    );

    const result = await useCase.execute('user-1');

    expect(result.subscriptionPlan).toBe('FREE');
  });

  it('throws NOT_FOUND when the user does not exist', async () => {
    const { userRepo, subscriptionRepo, tenantContext } = buildDeps();
    userRepo.findById.mockResolvedValue(null);
    const useCase = new GetUserProfileUseCase(
      userRepo as any,
      subscriptionRepo as any,
      tenantContext as any,
    );

    await expect(useCase.execute('missing')).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    } satisfies Partial<AppError>);
  });
});
