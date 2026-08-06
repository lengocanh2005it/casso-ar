export interface EmailTemplateProps {
  id: string;
  organizationId: string;
  name: string;
  subject: string;
  bodyHtml: string;
  reminderStage: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export class EmailTemplate {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly subject: string;
  readonly bodyHtml: string;
  readonly reminderStage: string | null;
  readonly isDefault: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;

  constructor(props: EmailTemplateProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.name = props.name;
    this.subject = props.subject;
    this.bodyHtml = props.bodyHtml;
    this.reminderStage = props.reminderStage;
    this.isDefault = props.isDefault;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.version = props.version;
  }

  updateContent(subject: string, bodyHtml: string): EmailTemplate {
    return new EmailTemplate({
      ...this,
      subject,
      bodyHtml,
      updatedAt: new Date(),
    });
  }
}
