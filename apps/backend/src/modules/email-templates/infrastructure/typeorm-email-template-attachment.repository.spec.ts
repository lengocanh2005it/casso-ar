import { EmailTemplateAttachment } from '../domain/email-template-attachment';
import { TypeOrmEmailTemplateAttachmentRepository } from './typeorm-email-template-attachment.repository';

function buildAttachment(): EmailTemplateAttachment {
  return new EmailTemplateAttachment({
    id: 'att-1',
    organizationId: 'org-1',
    emailTemplateId: 'tpl-1',
    filename: 'invoice.pdf',
    storageKey: 'org-1/tpl-1/uuid.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 12345,
    createdAt: new Date('2026-08-21'),
  });
}

describe('TypeOrmEmailTemplateAttachmentRepository', () => {
  it('scopes findAllByTemplateId by organizationId via BaseRepository', async () => {
    const ormRepo = { find: jest.fn().mockResolvedValue([]) };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const repo = new TypeOrmEmailTemplateAttachmentRepository(
      ormRepo as any,
      tenantContext as any,
    );

    await repo.findAllByTemplateId('tpl-1');

    expect(ormRepo.find).toHaveBeenCalledWith({
      where: { emailTemplateId: 'tpl-1', organizationId: 'org-1' },
    });
  });

  it('maps EmailTemplateAttachment to the ORM shape on save', async () => {
    const ormRepo = { save: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const repo = new TypeOrmEmailTemplateAttachmentRepository(
      ormRepo as any,
      tenantContext as any,
    );
    const attachment = buildAttachment();

    await repo.save(attachment);

    expect(ormRepo.save).toHaveBeenCalledWith({
      id: 'att-1',
      organizationId: 'org-1',
      emailTemplateId: 'tpl-1',
      filename: 'invoice.pdf',
      storageKey: 'org-1/tpl-1/uuid.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12345,
      createdAt: attachment.createdAt,
    });
  });

  it('scopes deleteAllByTemplateId by organizationId', async () => {
    const ormRepo = { delete: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const repo = new TypeOrmEmailTemplateAttachmentRepository(
      ormRepo as any,
      tenantContext as any,
    );

    await repo.deleteAllByTemplateId('tpl-1');

    expect(ormRepo.delete).toHaveBeenCalledWith({
      emailTemplateId: 'tpl-1',
      organizationId: 'org-1',
    });
  });
});
