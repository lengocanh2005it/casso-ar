export const SMTP_CONFIG_FAILED = 'smtp-config.failed';

export interface SmtpConfigFailedEvent {
  organizationId: string;
  smtpConfigId: string;
}
