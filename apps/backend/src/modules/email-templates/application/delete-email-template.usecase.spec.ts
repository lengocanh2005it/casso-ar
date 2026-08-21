import type { EntityManager } from 'typeorm';
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
    version: 1,
  });
}

function buildDataSource(queryResult?: unknown) {
  return {
    query: jest.fn().mockResolvedValue(queryResult ?? [{ count: 0 }]),
    transaction: jest.fn((cb: (m: EntityManager) => Promise<void>) =>
      cb({} as EntityManager),
    ),
  };
}

describe('DeleteEmailTemplateUseCase', () => {
  it('throws when the template does not exist', async () => {
    const templateRepo = {
      findById: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
    };
    const dataSource = buildDataSource();
    const attachmentRepo = {
      findAllByTemplateId: jest.fn().mockResolvedValue([]),
      deleteAllByTemplateId: jest.fn(),
    };
    const storage = { delete: jest.fn() };
    const useCase = new DeleteEmailTemplateUseCase(
      templateRepo as any,
      dataSource as any,
      attachmentRepo as any,
      storage as any,
    );

    await expect(useCase.execute('missing')).rejects.toThrow(
      'Không tìm thấy mẫu email.',
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('throws when isDefault is true, without querying reminder rules', async () => {
    const templateRepo = {
      findById: jest.fn().mockResolvedValue(buildTemplate(true)),
      delete: jest.fn(),
    };
    const dataSource = buildDataSource();
    const attachmentRepo = {
      findAllByTemplateId: jest.fn().mockResolvedValue([]),
      deleteAllByTemplateId: jest.fn(),
    };
    const storage = { delete: jest.fn() };
    const useCase = new DeleteEmailTemplateUseCase(
      templateRepo as any,
      dataSource as any,
      attachmentRepo as any,
      storage as any,
    );

    await expect(useCase.execute('tpl-1')).rejects.toThrow(
      'Không thể xóa mẫu email mặc định.',
    );
    expect(dataSource.query).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(templateRepo.delete).not.toHaveBeenCalled();
  });

  it('throws when a reminder rule still references the template', async () => {
    const templateRepo = {
      findById: jest.fn().mockResolvedValue(buildTemplate(false)),
      delete: jest.fn(),
    };
    const dataSource = buildDataSource([{ count: 1 }]);
    const attachmentRepo = {
      findAllByTemplateId: jest.fn().mockResolvedValue([]),
      deleteAllByTemplateId: jest.fn(),
    };
    const storage = { delete: jest.fn() };
    const useCase = new DeleteEmailTemplateUseCase(
      templateRepo as any,
      dataSource as any,
      attachmentRepo as any,
      storage as any,
    );

    await expect(useCase.execute('tpl-1')).rejects.toThrow(
      'Không thể xóa mẫu email đang được một quy tắc nhắc nhở sử dụng.',
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(templateRepo.delete).not.toHaveBeenCalled();
  });

  it('propagates a missing reminder table error instead of deleting the template', async () => {
    const templateRepo = {
      findById: jest.fn().mockResolvedValue(buildTemplate(false)),
      delete: jest.fn(),
    };
    const dataSource = {
      query: jest.fn().mockRejectedValue({ code: '42P01' }),
      transaction: jest.fn((cb: (m: EntityManager) => Promise<void>) =>
        cb({} as EntityManager),
      ),
    };
    const attachmentRepo = {
      findAllByTemplateId: jest.fn().mockResolvedValue([]),
      deleteAllByTemplateId: jest.fn(),
    };
    const storage = { delete: jest.fn() };
    const useCase = new DeleteEmailTemplateUseCase(
      templateRepo as any,
      dataSource as any,
      attachmentRepo as any,
      storage as any,
    );

    await expect(useCase.execute('tpl-1')).rejects.toMatchObject({
      code: '42P01',
    });

    expect(templateRepo.delete).not.toHaveBeenCalled();
  });

  it('deletes the template when no reminder rule references it', async () => {
    const templateRepo = {
      findById: jest.fn().mockResolvedValue(buildTemplate(false)),
      delete: jest.fn(),
    };
    const dataSource = buildDataSource([{ count: 0 }]);
    const attachmentRepo = {
      findAllByTemplateId: jest.fn().mockResolvedValue([]),
      deleteAllByTemplateId: jest.fn(),
    };
    const storage = { delete: jest.fn() };
    const useCase = new DeleteEmailTemplateUseCase(
      templateRepo as any,
      dataSource as any,
      attachmentRepo as any,
      storage as any,
    );

    await useCase.execute('tpl-1');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(templateRepo.delete).toHaveBeenCalledWith(
      'tpl-1',
      expect.anything(),
    );
  });

  it('scopes the reminder-rule reference query by the template organizationId', async () => {
    const templateRepo = {
      findById: jest.fn().mockResolvedValue(buildTemplate(false)),
      delete: jest.fn(),
    };
    const dataSource = buildDataSource([{ count: 0 }]);
    const attachmentRepo = {
      findAllByTemplateId: jest.fn().mockResolvedValue([]),
      deleteAllByTemplateId: jest.fn(),
    };
    const storage = { delete: jest.fn() };
    const useCase = new DeleteEmailTemplateUseCase(
      templateRepo as any,
      dataSource as any,
      attachmentRepo as any,
      storage as any,
    );

    await useCase.execute('tpl-1');

    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [
      'tpl-1',
      'org-1',
    ]);
  });

  it('scopes reminder-rule references through their policy organization', async () => {
    const templateRepo = {
      findById: jest.fn().mockResolvedValue(buildTemplate(false)),
      delete: jest.fn(),
    };
    const dataSource = buildDataSource([{ count: 0 }]);
    const attachmentRepo = {
      findAllByTemplateId: jest.fn().mockResolvedValue([]),
      deleteAllByTemplateId: jest.fn(),
    };
    const storage = { delete: jest.fn() };
    const useCase = new DeleteEmailTemplateUseCase(
      templateRepo as any,
      dataSource as any,
      attachmentRepo as any,
      storage as any,
    );

    await useCase.execute('tpl-1');

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'JOIN reminder_policies p ON p.id::text = r."reminderPolicyId" WHERE r."emailTemplateId" = $1 AND p."organizationId" = $2',
      ),
      ['tpl-1', 'org-1'],
    );
  });

  it('deletes attachment files from storage and their rows atomically with the template, cleaning up disk only after commit', async () => {
    const templateRepo = {
      findById: jest.fn().mockResolvedValue(buildTemplate(false)),
      delete: jest.fn(),
    };
    const dataSource = buildDataSource([{ count: 0 }]);
    const attachmentRepo = {
      findAllByTemplateId: jest
        .fn()
        .mockResolvedValue([
          { storageKey: 'org-1/tpl-1/a.pdf' },
          { storageKey: 'org-1/tpl-1/b.png' },
        ]),
      deleteAllByTemplateId: jest.fn(),
    };
    const storage = { delete: jest.fn() };
    const useCase = new DeleteEmailTemplateUseCase(
      templateRepo as any,
      dataSource as any,
      attachmentRepo as any,
      storage as any,
    );

    await useCase.execute('tpl-1');

    expect(attachmentRepo.deleteAllByTemplateId).toHaveBeenCalledWith(
      'tpl-1',
      expect.anything(),
    );
    expect(templateRepo.delete).toHaveBeenCalledWith(
      'tpl-1',
      expect.anything(),
    );
    expect(storage.delete).toHaveBeenCalledWith('org-1/tpl-1/a.pdf');
    expect(storage.delete).toHaveBeenCalledWith('org-1/tpl-1/b.png');
  });

  it('does not attempt disk cleanup when the transaction fails', async () => {
    const templateRepo = {
      findById: jest.fn().mockResolvedValue(buildTemplate(false)),
      delete: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const dataSource = buildDataSource([{ count: 0 }]);
    const attachmentRepo = {
      findAllByTemplateId: jest
        .fn()
        .mockResolvedValue([{ storageKey: 'org-1/tpl-1/a.pdf' }]),
      deleteAllByTemplateId: jest.fn(),
    };
    const storage = { delete: jest.fn() };
    const useCase = new DeleteEmailTemplateUseCase(
      templateRepo as any,
      dataSource as any,
      attachmentRepo as any,
      storage as any,
    );

    await expect(useCase.execute('tpl-1')).rejects.toThrow('db down');
    expect(storage.delete).not.toHaveBeenCalled();
  });
});
