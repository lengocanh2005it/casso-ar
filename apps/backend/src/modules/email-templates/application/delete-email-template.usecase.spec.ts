import { EmailTemplate } from '../domain/email-template';
import { DeleteEmailTemplateUseCase } from './delete-email-template.usecase';

function buildTemplate(isDefault: boolean): EmailTemplate {
  return new EmailTemplate({
    id: 'tpl-1',
    organizationId: 'org-1',
    name: 'x',
    subject: 'x',
    bodyHtml: 'x',
    reminderStage: null,
    isDefault,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
  });
}

describe('DeleteEmailTemplateUseCase', () => {
  it('throws when the template does not exist', async () => {
    const templateRepo = {
      findById: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
    };
    const dataSource = { query: jest.fn() };
    const useCase = new DeleteEmailTemplateUseCase(
      templateRepo as any,
      dataSource as any,
    );

    await expect(useCase.execute('missing')).rejects.toThrow(
      'Không tìm thấy mẫu email.',
    );
  });

  it('throws when isDefault is true, without querying reminder rules', async () => {
    const templateRepo = {
      findById: jest.fn().mockResolvedValue(buildTemplate(true)),
      delete: jest.fn(),
    };
    const dataSource = { query: jest.fn() };
    const useCase = new DeleteEmailTemplateUseCase(
      templateRepo as any,
      dataSource as any,
    );

    await expect(useCase.execute('tpl-1')).rejects.toThrow(
      'Không thể xóa mẫu email mặc định.',
    );
    expect(dataSource.query).not.toHaveBeenCalled();
    expect(templateRepo.delete).not.toHaveBeenCalled();
  });

  it('throws when a reminder rule still references the template', async () => {
    const templateRepo = {
      findById: jest.fn().mockResolvedValue(buildTemplate(false)),
      delete: jest.fn(),
    };
    const dataSource = { query: jest.fn().mockResolvedValue([{ count: 1 }]) };
    const useCase = new DeleteEmailTemplateUseCase(
      templateRepo as any,
      dataSource as any,
    );

    await expect(useCase.execute('tpl-1')).rejects.toThrow(
      'Không thể xóa mẫu email đang được một quy tắc nhắc nhở sử dụng.',
    );
    expect(templateRepo.delete).not.toHaveBeenCalled();
  });

  it('deletes the template when the reminder_rules table does not exist yet (Postgres 42P01)', async () => {
    const templateRepo = {
      findById: jest.fn().mockResolvedValue(buildTemplate(false)),
      delete: jest.fn(),
    };
    const dataSource = {
      query: jest.fn().mockRejectedValue({ code: '42P01' }),
    };
    const useCase = new DeleteEmailTemplateUseCase(
      templateRepo as any,
      dataSource as any,
    );

    await useCase.execute('tpl-1');

    expect(templateRepo.delete).toHaveBeenCalledWith('tpl-1');
  });

  it('deletes the template when no reminder rule references it', async () => {
    const templateRepo = {
      findById: jest.fn().mockResolvedValue(buildTemplate(false)),
      delete: jest.fn(),
    };
    const dataSource = { query: jest.fn().mockResolvedValue([{ count: 0 }]) };
    const useCase = new DeleteEmailTemplateUseCase(
      templateRepo as any,
      dataSource as any,
    );

    await useCase.execute('tpl-1');

    expect(templateRepo.delete).toHaveBeenCalledWith('tpl-1');
  });

  it('scopes the reminder-rule reference query by the template organizationId', async () => {
    const templateRepo = {
      findById: jest.fn().mockResolvedValue(buildTemplate(false)),
      delete: jest.fn(),
    };
    const dataSource = { query: jest.fn().mockResolvedValue([{ count: 0 }]) };
    const useCase = new DeleteEmailTemplateUseCase(
      templateRepo as any,
      dataSource as any,
    );

    await useCase.execute('tpl-1');

    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [
      'tpl-1',
      'org-1',
    ]);
  });
});
