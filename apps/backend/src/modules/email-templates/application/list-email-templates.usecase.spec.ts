import { ListEmailTemplatesUseCase } from './list-email-templates.usecase';

describe('ListEmailTemplatesUseCase', () => {
  it('delegates to the repository for the current organization', async () => {
    const templates = [{ id: 'tpl-1' }];
    const templateRepo = {
      findAllForOrganization: jest.fn().mockResolvedValue(templates),
    };
    const attachmentRepo = {
      findAllByTemplateId: jest.fn().mockResolvedValue([]),
    };

    const useCase = new ListEmailTemplatesUseCase(
      templateRepo as any,
      attachmentRepo as any,
    );
    const result = await useCase.execute({ page: 1, limit: 20 });

    expect(result).toEqual([{ template: templates[0], attachments: [] }]);
    expect(templateRepo.findAllForOrganization).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
    });
  });

  it('defaults to page 1 / limit 20 and clamps limit to 100', async () => {
    const templateRepo = {
      findAllForOrganization: jest.fn().mockResolvedValue([]),
    };
    const attachmentRepo = {
      findAllByTemplateId: jest.fn().mockResolvedValue([]),
    };
    const useCase = new ListEmailTemplatesUseCase(
      templateRepo as any,
      attachmentRepo as any,
    );

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

  it('fetches attachments for each template', async () => {
    const templates = [{ id: 'tpl-1' }, { id: 'tpl-2' }];
    const templateRepo = {
      findAllForOrganization: jest.fn().mockResolvedValue(templates),
    };
    const attachmentRepo = {
      findAllByTemplateId: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'att-1' }])
        .mockResolvedValueOnce([]),
    };

    const useCase = new ListEmailTemplatesUseCase(
      templateRepo as any,
      attachmentRepo as any,
    );
    const result = await useCase.execute({});

    expect(result).toHaveLength(2);
    expect(result[0].attachments).toEqual([{ id: 'att-1' }]);
    expect(result[1].attachments).toEqual([]);
    expect(attachmentRepo.findAllByTemplateId).toHaveBeenCalledWith('tpl-1');
    expect(attachmentRepo.findAllByTemplateId).toHaveBeenCalledWith('tpl-2');
  });
});
