import { ListEmailTemplatesUseCase } from './list-email-templates.usecase';

describe('ListEmailTemplatesUseCase', () => {
  it('delegates to the repository for the current organization', async () => {
    const templates = [{ id: 'tpl-1' }];
    const templateRepo = {
      findAllForOrganization: jest.fn().mockResolvedValue(templates),
    };

    const useCase = new ListEmailTemplatesUseCase(templateRepo as any);
    const result = await useCase.execute();

    expect(result).toBe(templates);
    expect(templateRepo.findAllForOrganization).toHaveBeenCalled();
  });
});
