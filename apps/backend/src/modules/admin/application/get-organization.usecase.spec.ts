import { ErrorCode } from '../../../common/errors/error-code';
import { Organization } from '../../organizations/domain/organization';
import { GetOrganizationUseCase } from './get-organization.usecase';

function buildOrganization(
  overrides: Partial<Organization> = {},
): Organization {
  return new Organization({
    id: 'org-1',
    name: 'Acme',
    createdAt: new Date('2026-08-01'),
    ...overrides,
  });
}

describe('GetOrganizationUseCase', () => {
  it('returns the requested organization', async () => {
    const organization = buildOrganization({ id: 'org-1', name: 'Acme' });
    const repo = { findById: jest.fn().mockResolvedValue(organization) };
    const useCase = new GetOrganizationUseCase(repo as never);

    await expect(useCase.execute({ organizationId: 'org-1' })).resolves.toBe(
      organization,
    );
    expect(repo.findById).toHaveBeenCalledWith('org-1');
  });

  it('throws NOT_FOUND when the organization does not exist', async () => {
    const useCase = new GetOrganizationUseCase({
      findById: jest.fn().mockResolvedValue(null),
    } as never);

    await expect(
      useCase.execute({ organizationId: 'org-1' }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
  });
});
