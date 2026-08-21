export interface EmailTemplateAttachmentProps {
  id: string;
  organizationId: string;
  emailTemplateId: string;
  filename: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}

export class EmailTemplateAttachment {
  readonly id: string;
  readonly organizationId: string;
  readonly emailTemplateId: string;
  readonly filename: string;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly createdAt: Date;

  constructor(props: EmailTemplateAttachmentProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.emailTemplateId = props.emailTemplateId;
    this.filename = props.filename;
    this.storageKey = props.storageKey;
    this.mimeType = props.mimeType;
    this.sizeBytes = props.sizeBytes;
    this.createdAt = props.createdAt;
  }
}
