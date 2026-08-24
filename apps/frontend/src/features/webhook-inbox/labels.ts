import type { WebhookInboxStatus } from './types';

export const WEBHOOK_INBOX_STATUS_LABELS: Record<WebhookInboxStatus, string> = {
  RECEIVED: 'Đã nhận',
  PROCESSED: 'Đã xử lý',
  FAILED: 'Thất bại',
};

export const WEBHOOK_INBOX_STATUS_OPTIONS: {
  value: 'ALL' | WebhookInboxStatus;
  label: string;
}[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'RECEIVED', label: WEBHOOK_INBOX_STATUS_LABELS.RECEIVED },
  { value: 'PROCESSED', label: WEBHOOK_INBOX_STATUS_LABELS.PROCESSED },
  { value: 'FAILED', label: WEBHOOK_INBOX_STATUS_LABELS.FAILED },
];

export const WEBHOOK_INBOX_STATUS_BADGE_VARIANT: Record<
  WebhookInboxStatus,
  'outline' | 'secondary' | 'destructive'
> = {
  RECEIVED: 'outline',
  PROCESSED: 'secondary',
  FAILED: 'destructive',
};
