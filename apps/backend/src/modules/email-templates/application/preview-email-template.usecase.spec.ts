import { EmailTemplate } from '../domain/email-template';
import { HandlebarsTemplateCompiler } from '../infrastructure/handlebars-template-compiler.adapter';
import { PreviewEmailTemplateUseCase } from './preview-email-template.usecase';
import { RenderEmailTemplateUseCase } from './render-email-template.usecase';

function buildRenderUseCase(): RenderEmailTemplateUseCase {
  return new RenderEmailTemplateUseCase(new HandlebarsTemplateCompiler());
}

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
      version: 1,
    });
    const templateRepo = { findById: jest.fn().mockResolvedValue(template) };
    const renderUseCase = buildRenderUseCase();

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
      buildRenderUseCase(),
    );

    await expect(useCase.execute('missing')).rejects.toThrow(
      'Không tìm thấy mẫu email.',
    );
  });
});
