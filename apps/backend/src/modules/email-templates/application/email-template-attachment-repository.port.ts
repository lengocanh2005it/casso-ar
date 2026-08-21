import type { EntityManager } from 'typeorm';
import type { EmailTemplateAttachment } from '../domain/email-template-attachment';

export interface IEmailTemplateAttachmentRepository {
  findById(id: string): Promise<EmailTemplateAttachment | null>;
  findAllByTemplateId(
    emailTemplateId: string,
  ): Promise<EmailTemplateAttachment[]>;
  save(
    attachment: EmailTemplateAttachment,
    manager?: EntityManager,
  ): Promise<void>;
  delete(id: string): Promise<void>;
  deleteAllByTemplateId(emailTemplateId: string): Promise<void>;
}

export const EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY = Symbol(
  'EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY',
);
