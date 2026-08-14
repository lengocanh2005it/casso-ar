import type { EmailTemplate } from '../../domain/email-template';

export class EmailTemplateResponseDto {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  reminderStage: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toEmailTemplateResponse(
  template: EmailTemplate,
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
  };
}
