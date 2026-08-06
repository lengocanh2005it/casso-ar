import { CreateEmailTemplateUseCase } from './create-email-template.usecase';

describe('CreateEmailTemplateUseCase', () => {
  it('creates a non-default template scoped to the current organization', async () => {
    const templateRepo = { save: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };

    const useCase = new CreateEmailTemplateUseCase(
      templateRepo as any,
      tenantContext as any,
    );

    const result = await useCase.execute({
      name: 'Custom Reminder',
      subject: 'Hello {{customerName}}',
      bodyHtml: '<p>{{customerName}}</p>',
      reminderStage: null,
    });

    expect(result.organizationId).toBe('org-1');
    expect(result.isDefault).toBe(false);
    expect(templateRepo.save).toHaveBeenCalledWith(result);
  });
});
