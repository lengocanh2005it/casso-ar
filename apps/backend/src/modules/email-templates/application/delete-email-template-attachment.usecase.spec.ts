import { EmailTemplateAttachment } from '../domain/email-template-attachment';
import { DeleteEmailTemplateAttachmentUseCase } from './delete-email-template-attachment.usecase';

function buildAttachment(emailTemplateId = 'tpl-1'): EmailTemplateAttachment {
  return new EmailTemplateAttachment({
    id: 'att-1',
    organizationId: 'org-1',
    emailTemplateId,
    filename: 'invoice.pdf',
    storageKey: 'org-1/tpl-1/uuid.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1000,
    createdAt: new Date('2026-08-21'),
  });
}

describe('DeleteEmailTemplateAttachmentUseCase', () => {
  it('throws ATTACHMENT_NOT_FOUND when the attachment does not exist', async () => {
    const attachmentRepo = {
      findById: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
    };
    const storage = { delete: jest.fn() };
    const useCase = new DeleteEmailTemplateAttachmentUseCase(
      attachmentRepo as any,
      storage as any,
    );

    await expect(useCase.execute('tpl-1', 'missing')).rejects.toThrow(
      'Không tìm thấy file đính kèm.',
    );
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('throws ATTACHMENT_NOT_FOUND when the attachment belongs to a different template', async () => {
    const attachmentRepo = {
      findById: jest.fn().mockResolvedValue(buildAttachment('tpl-other')),
      delete: jest.fn(),
    };
    const storage = { delete: jest.fn() };
    const useCase = new DeleteEmailTemplateAttachmentUseCase(
      attachmentRepo as any,
      storage as any,
    );

    await expect(useCase.execute('tpl-1', 'att-1')).rejects.toThrow(
      'Không tìm thấy file đính kèm.',
    );
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('deletes the file from storage and the DB row when found', async () => {
    const attachment = buildAttachment();
    const attachmentRepo = {
      findById: jest.fn().mockResolvedValue(attachment),
      delete: jest.fn(),
    };
    const storage = { delete: jest.fn() };
    const useCase = new DeleteEmailTemplateAttachmentUseCase(
      attachmentRepo as any,
      storage as any,
    );

    await useCase.execute('tpl-1', 'att-1');

    expect(storage.delete).toHaveBeenCalledWith('org-1/tpl-1/uuid.pdf');
    expect(attachmentRepo.delete).toHaveBeenCalledWith('att-1');
  });
});
