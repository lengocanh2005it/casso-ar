import { EmailTemplate } from '../domain/email-template';
import { PreviewEmailTemplateUseCase } from './preview-email-template.usecase';
import { RenderEmailTemplateUseCase } from './render-email-template.usecase';

describe('PreviewEmailTemplateUseCase', () => {
  it('renders the template with hard-coded sample data', async () => {
    const template = new EmailTemplate({
      id: 'tpl-1',
      organizationId: 'org-1',
      name: 'x',
      subject: 'Hello {{customerName}}',
      bodyHtml: '<p>{{customerName}} owes {{remainingAmount}}</p>',
      reminderStage: null,
      isDefault: false,
      createdAt: new Date('2026-08-01'),
      updatedAt: new Date('2026-08-01'),
    });
    const templateRepo = { findById: jest.fn().mockResolvedValue(template) };
    const renderUseCase = new RenderEmailTemplateUseCase();

    const useCase = new PreviewEmailTemplateUseCase(
      templateRepo as never,
      renderUseCase,
    );
    const result = await useCase.execute('tpl-1');

    expect(result.subject).toContain('Hello');
    expect(result.bodyHtml).toContain('owes');
  });

  it('throws when the template does not exist', async () => {
    const templateRepo = { findById: jest.fn().mockResolvedValue(null) };
    const useCase = new PreviewEmailTemplateUseCase(
      templateRepo as never,
      new RenderEmailTemplateUseCase(),
    );

    await expect(useCase.execute('missing')).rejects.toThrow(
      'Không tìm thấy mẫu email.',
    );
  });
});
