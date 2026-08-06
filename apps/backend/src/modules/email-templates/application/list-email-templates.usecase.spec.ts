import { ListEmailTemplatesUseCase } from './list-email-templates.usecase';

describe('ListEmailTemplatesUseCase', () => {
  it('delegates to the repository for the current organization', async () => {
    const templates = [{ id: 'tpl-1' }];
    const templateRepo = {
      findAllForOrganization: jest.fn().mockResolvedValue(templates),
    };

    const useCase = new ListEmailTemplatesUseCase(templateRepo as any);
    const result = await useCase.execute({ page: 1, limit: 20 });

    expect(result).toBe(templates);
    expect(templateRepo.findAllForOrganization).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
    });
  });

  it('defaults to page 1 / limit 20 and clamps limit to 100', async () => {
    const templateRepo = {
      findAllForOrganization: jest.fn().mockResolvedValue([]),
    };
    const useCase = new ListEmailTemplatesUseCase(templateRepo as any);

    await useCase.execute({});
    expect(templateRepo.findAllForOrganization).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
    });

    await useCase.execute({ page: 0, limit: 500 });
    expect(templateRepo.findAllForOrganization).toHaveBeenCalledWith({
      page: 1,
      limit: 100,
    });
  });
});
