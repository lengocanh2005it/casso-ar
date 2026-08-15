import type { AlertPage } from '../../application/alert-repository.port';
import type { Alert, AlertType } from '../../domain/alert';

export class AlertResponseDto {
  id: string;
  type: AlertType;
  entityType: string;
  entityId: string;
  isRead: boolean;
  createdAt: string;
}

export class AlertsPageResponseDto {
  items: AlertResponseDto[];
  total: number;
  unreadCount: number;
}

export function toAlertResponse(alert: Alert): AlertResponseDto {
  return {
    id: alert.id,
    type: alert.type,
    entityType: alert.entityType,
    entityId: alert.entityId,
    isRead: alert.isRead(),
    createdAt: alert.createdAt.toISOString(),
  };
}

export function toAlertsPageResponse(page: AlertPage): AlertsPageResponseDto {
  return {
    items: page.items.map(toAlertResponse),
    total: page.total,
    unreadCount: page.unreadCount,
  };
}
