import { EmailTemplate } from '../domain/email-template';
import { UploadEmailTemplateAttachmentUseCase } from './upload-email-template-attachment.usecase';

function buildTemplate(): EmailTemplate {
  return new EmailTemplate({
    id: 'tpl-1',
    organizationId: 'org-1',
    name: 'x',
    subject: 'x',
    bodyHtml: 'x',
    reminderStage: null,
    isDefault: false,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    version: 1,
  });
}

function buildDeps(overrides?: {
  existingAttachments?: Array<{ sizeBytes: number }>;
}) {
  const templateRepo = {
    findById: jest.fn().mockResolvedValue(buildTemplate()),
  };
  const attachmentRepo = {
    findAllByTemplateId: jest
      .fn()
      .mockResolvedValue(overrides?.existingAttachments ?? []),
    save: jest.fn(),
  };
  const storage = { save: jest.fn().mockResolvedValue('org-1/tpl-1/uuid.pdf') };
  const tenantContext = { getOrganizationId: () => 'org-1' };
  return { templateRepo, attachmentRepo, storage, tenantContext };
}

describe('UploadEmailTemplateAttachmentUseCase', () => {
  it('rejects a disallowed MIME type without touching storage', async () => {
    const deps = buildDeps();
    const useCase = new UploadEmailTemplateAttachmentUseCase(
      deps.templateRepo as any,
      deps.attachmentRepo as any,
      deps.storage as any,
      deps.tenantContext as any,
    );

    await expect(
      useCase.execute({
        emailTemplateId: 'tpl-1',
        originalFilename: 'resume.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: 1000,
        buffer: Buffer.from('x'),
      }),
    ).rejects.toThrow('Định dạng file không hợp lệ');
    expect(deps.storage.save).not.toHaveBeenCalled();
  });

  it('rejects a file over the 10MB per-file limit', async () => {
    const deps = buildDeps();
    const useCase = new UploadEmailTemplateAttachmentUseCase(
      deps.templateRepo as any,
      deps.attachmentRepo as any,
      deps.storage as any,
      deps.tenantContext as any,
    );

    await expect(
      useCase.execute({
        emailTemplateId: 'tpl-1',
        originalFilename: 'big.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 11 * 1024 * 1024,
        buffer: Buffer.from('x'),
      }),
    ).rejects.toThrow('File quá lớn');
    expect(deps.storage.save).not.toHaveBeenCalled();
  });

  it('rejects a 6th file once the template already has 5 attachments', async () => {
    const deps = buildDeps({
      existingAttachments: [
        { sizeBytes: 1 },
        { sizeBytes: 1 },
        { sizeBytes: 1 },
        { sizeBytes: 1 },
        { sizeBytes: 1 },
      ],
    });
    const useCase = new UploadEmailTemplateAttachmentUseCase(
      deps.templateRepo as any,
      deps.attachmentRepo as any,
      deps.storage as any,
      deps.tenantContext as any,
    );

    await expect(
      useCase.execute({
        emailTemplateId: 'tpl-1',
        originalFilename: 'extra.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        buffer: Buffer.from('x'),
      }),
    ).rejects.toThrow('Đã đạt số lượng file đính kèm tối đa');
    expect(deps.storage.save).not.toHaveBeenCalled();
  });

  it('rejects a file that would push the template total over 25MB', async () => {
    const deps = buildDeps({
      existingAttachments: [{ sizeBytes: 24 * 1024 * 1024 }],
    });
    const useCase = new UploadEmailTemplateAttachmentUseCase(
      deps.templateRepo as any,
      deps.attachmentRepo as any,
      deps.storage as any,
      deps.tenantContext as any,
    );

    await expect(
      useCase.execute({
        emailTemplateId: 'tpl-1',
        originalFilename: 'extra.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2 * 1024 * 1024,
        buffer: Buffer.from('x'),
      }),
    ).rejects.toThrow('Tổng dung lượng file đính kèm vượt quá 25MB');
    expect(deps.storage.save).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the template does not belong to the current organization', async () => {
    const deps = buildDeps();
    deps.templateRepo.findById.mockResolvedValue(null);
    const useCase = new UploadEmailTemplateAttachmentUseCase(
      deps.templateRepo as any,
      deps.attachmentRepo as any,
      deps.storage as any,
      deps.tenantContext as any,
    );

    await expect(
      useCase.execute({
        emailTemplateId: 'tpl-missing',
        originalFilename: 'a.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        buffer: Buffer.from('x'),
      }),
    ).rejects.toThrow('Không tìm thấy mẫu email');
  });

  it('saves the file to storage and persists metadata when all checks pass', async () => {
    const deps = buildDeps();
    const useCase = new UploadEmailTemplateAttachmentUseCase(
      deps.templateRepo as any,
      deps.attachmentRepo as any,
      deps.storage as any,
      deps.tenantContext as any,
    );

    const result = await useCase.execute({
      emailTemplateId: 'tpl-1',
      originalFilename: 'invoice.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1000,
      buffer: Buffer.from('pdf-bytes'),
    });

    expect(deps.storage.save).toHaveBeenCalledWith(
      'org-1',
      'tpl-1',
      'invoice.pdf',
      Buffer.from('pdf-bytes'),
    );
    expect(result.organizationId).toBe('org-1');
    expect(result.emailTemplateId).toBe('tpl-1');
    expect(result.filename).toBe('invoice.pdf');
    expect(result.storageKey).toBe('org-1/tpl-1/uuid.pdf');
    expect(deps.attachmentRepo.save).toHaveBeenCalledWith(result);
  });
});
