import { GetOrganizationSummaryUseCase } from './get-organization-summary.usecase';

describe('GetOrganizationSummaryUseCase', () => {
  it('totals every status bucket', async () => {
    const organizationRepo = {
      countByStatus: jest.fn().mockResolvedValue({
        ACTIVE: 200,
        LOCKED: 30,
        PENDING_REVIEW: 15,
        REJECTED: 5,
      }),
    };
    const useCase = new GetOrganizationSummaryUseCase(organizationRepo as any);

    const result = await useCase.execute();

    expect(organizationRepo.countByStatus).toHaveBeenCalledWith();
    expect(result).toEqual({
      total: 250,
      statusCounts: {
        ACTIVE: 200,
        LOCKED: 30,
        PENDING_REVIEW: 15,
        REJECTED: 5,
      },
    });
  });

  it('reports zero for an installation with no organizations', async () => {
    const organizationRepo = {
      countByStatus: jest.fn().mockResolvedValue({
        ACTIVE: 0,
        LOCKED: 0,
        PENDING_REVIEW: 0,
        REJECTED: 0,
      }),
    };
    const useCase = new GetOrganizationSummaryUseCase(organizationRepo as any);

    await expect(useCase.execute()).resolves.toEqual({
      total: 0,
      statusCounts: {
        ACTIVE: 0,
        LOCKED: 0,
        PENDING_REVIEW: 0,
        REJECTED: 0,
      },
    });
  });
});
