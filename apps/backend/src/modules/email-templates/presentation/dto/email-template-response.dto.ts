import type { EmailTemplate } from '../../domain/email-template';
import type { EmailTemplateAttachment } from '../../domain/email-template-attachment';
import {
  EmailTemplateAttachmentResponseDto,
  toEmailTemplateAttachmentResponse,
} from './email-template-attachment-response.dto';

export class EmailTemplateResponseDto {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  reminderStage: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  attachments: EmailTemplateAttachmentResponseDto[];
}

export function toEmailTemplateResponse(
  template: EmailTemplate,
  attachments: EmailTemplateAttachment[] = [],
): EmailTemplateResponseDto {
  return {
    id: template.id,
    name: template.name,
    subject: template.subject,
    bodyHtml: template.bodyHtml,
    reminderStage: template.reminderStage,
    isDefault: template.isDefault,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    attachments: attachments.map(toEmailTemplateAttachmentResponse),
  };
}
