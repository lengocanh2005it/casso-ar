import { EmailTemplate } from '../domain/email-template';
import { UpdateEmailTemplateUseCase } from './update-email-template.usecase';

describe('UpdateEmailTemplateUseCase', () => {
  it('updates subject/bodyHtml and persists the new version', async () => {
    const existing = new EmailTemplate({
      id: 'tpl-1',
      organizationId: 'org-1',
      name: '1 Day Overdue Reminder',
      subject: 'Old',
      bodyHtml: '<p>Old</p>',
      reminderStage: '1 Day Overdue Reminder',
      isDefault: true,
      createdAt: new Date('2026-08-01'),
      updatedAt: new Date('2026-08-01'),
    });
    const templateRepo = {
      findById: jest.fn().mockResolvedValue(existing),
      save: jest.fn(),
    };

    const useCase = new UpdateEmailTemplateUseCase(templateRepo as any);
    const result = await useCase.execute({
      id: 'tpl-1',
      subject: 'New',
      bodyHtml: '<p>New</p>',
    });

    expect(result.subject).toBe('New');
    expect(result.bodyHtml).toBe('<p>New</p>');
    expect(result.isDefault).toBe(true);
    expect(templateRepo.save).toHaveBeenCalledWith(result);
  });

  it('throws when the template does not exist', async () => {
    const templateRepo = {
      findById: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const useCase = new UpdateEmailTemplateUseCase(templateRepo as any);

    await expect(
      useCase.execute({ id: 'missing', subject: 'x', bodyHtml: 'y' }),
    ).rejects.toThrow('Không tìm thấy mẫu email.');
  });
});
