export type AlertType =
  | 'BANK_CONNECTION_NEEDS_REAUTH'
  | 'BANK_CONNECTION_ERROR'
  | 'SMTP_FAILED'
  | 'REMINDER_SCAN_SUMMARY';

export interface AlertDto {
  id: string;
  type: AlertType;
  entityType: string;
  entityId: string;
  isRead: boolean;
  createdAt: string;
}

export interface AlertsPage {
  items: AlertDto[];
  total: number;
  unreadCount: number;
}
