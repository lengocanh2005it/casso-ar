export enum AlertType {
  BANK_CONNECTION_NEEDS_REAUTH = 'BANK_CONNECTION_NEEDS_REAUTH',
  BANK_CONNECTION_ERROR = 'BANK_CONNECTION_ERROR',
  SMTP_FAILED = 'SMTP_FAILED',
  REMINDER_SCAN_SUMMARY = 'REMINDER_SCAN_SUMMARY',
}

export interface AlertProps {
  id: string;
  organizationId: string;
  userId: string;
  type: AlertType;
  entityType: string;
  entityId: string;
  readAt: Date | null;
  createdAt: Date;
}

export class Alert {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly type: AlertType;
  readonly entityType: string;
  readonly entityId: string;
  readonly readAt: Date | null;
  readonly createdAt: Date;

  constructor(props: AlertProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.userId = props.userId;
    this.type = props.type;
    this.entityType = props.entityType;
    this.entityId = props.entityId;
    this.readAt = props.readAt;
    this.createdAt = props.createdAt;
  }

  isRead(): boolean {
    return this.readAt !== null;
  }

  /** UNREAD -> READ, one-way. No-op (same instance) if already read. */
  markRead(now: Date = new Date()): Alert {
    if (this.readAt !== null) return this;
    return new Alert({ ...this, readAt: now });
  }
}
