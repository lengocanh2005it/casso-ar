import { EmailTemplateAttachment } from './email-template-attachment';

describe('EmailTemplateAttachment', () => {
  it('holds the fields needed to store, download, and inline-reference a file', () => {
    const createdAt = new Date('2026-08-21T00:00:00.000Z');
    const attachment = new EmailTemplateAttachment({
      id: 'att-1',
      organizationId: 'org-1',
      emailTemplateId: 'tpl-1',
      filename: 'invoice.pdf',
      storageKey: 'org-1/tpl-1/uuid-generated.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12345,
      createdAt,
    });

    expect(attachment.id).toBe('att-1');
    expect(attachment.organizationId).toBe('org-1');
    expect(attachment.emailTemplateId).toBe('tpl-1');
    expect(attachment.filename).toBe('invoice.pdf');
    expect(attachment.storageKey).toBe('org-1/tpl-1/uuid-generated.pdf');
    expect(attachment.mimeType).toBe('application/pdf');
    expect(attachment.sizeBytes).toBe(12345);
    expect(attachment.createdAt).toBe(createdAt);
  });
});
