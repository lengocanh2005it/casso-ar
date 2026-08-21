import type { EmailTemplateAttachment } from '../../domain/email-template-attachment';

export class EmailTemplateAttachmentResponseDto {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}

export function toEmailTemplateAttachmentResponse(
  attachment: EmailTemplateAttachment,
): EmailTemplateAttachmentResponseDto {
  return {
    id: attachment.id,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt,
  };
}
