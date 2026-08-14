import { Organization } from '../../organizations/domain/organization';
import { LockOrganizationUseCase } from './lock-organization.usecase';

function buildOrganization(
  overrides: Partial<Organization> = {},
): Organization {
  return new Organization({
    id: 'org-1',
    name: 'Acme',
    status: 'ACTIVE',
    createdAt: new Date('2026-08-01'),
    ...overrides,
  });
}

function buildDeps(organization: Organization | null) {
  const organizationRepo = {
    findById: jest.fn().mockResolvedValue(organization),
    save: jest.fn(),
  };
  const auditRepo = { save: jest.fn() };
  const dataSource = {
    transaction: jest.fn((callback: (manager: unknown) => unknown) =>
      callback({}),
    ),
  };
  return { organizationRepo, auditRepo, dataSource };
}

describe('LockOrganizationUseCase', () => {
  it('sets status to LOCKED and writes an OperatorAuditLog row', async () => {
    const { organizationRepo, auditRepo, dataSource } = buildDeps(
      buildOrganization(),
    );
    const useCase = new LockOrganizationUseCase(
      dataSource as any,
      organizationRepo as any,
      auditRepo as any,
    );

    await useCase.execute({ organizationId: 'org-1', operatorId: 'op-1' });

    expect(organizationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'LOCKED' }),
      expect.anything(),
    );
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: 'op-1',
        organizationId: 'org-1',
        actionType: 'ORGANIZATION_LOCKED',
      }),
      expect.anything(),
    );
  });

  it('is a no-op when the organization is already LOCKED', async () => {
    const { organizationRepo, auditRepo, dataSource } = buildDeps(
      buildOrganization({ status: 'LOCKED' }),
    );
    const useCase = new LockOrganizationUseCase(
      dataSource as any,
      organizationRepo as any,
      auditRepo as any,
    );

    await useCase.execute({ organizationId: 'org-1', operatorId: 'op-1' });

    expect(organizationRepo.save).not.toHaveBeenCalled();
    expect(auditRepo.save).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the organization does not exist', async () => {
    const { organizationRepo, auditRepo, dataSource } = buildDeps(null);
    const useCase = new LockOrganizationUseCase(
      dataSource as any,
      organizationRepo as any,
      auditRepo as any,
    );

    await expect(
      useCase.execute({ organizationId: 'org-1', operatorId: 'op-1' }),
    ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
  });
});
