import { ListOrganizationsUseCase } from './list-organizations.usecase';

describe('ListOrganizationsUseCase', () => {
  it('returns paginated organizations from the repository', async () => {
    const organizationRepo = {
      findAllPaginated: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'org-1',
            name: 'Acme',
            status: 'ACTIVE',
            createdAt: new Date('2026-08-01'),
          },
        ],
        total: 1,
      }),
    };
    const useCase = new ListOrganizationsUseCase(organizationRepo as any);

    const result = await useCase.execute({ page: 1, limit: 20 });

    expect(organizationRepo.findAllPaginated).toHaveBeenCalledWith(1, 20);
    expect(result).toEqual({
      items: [
        {
          id: 'org-1',
          name: 'Acme',
          status: 'ACTIVE',
          createdAt: new Date('2026-08-01'),
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
  });
});
