import { apiRequest } from '@/lib/api-client';
import type { AlertsPage } from '../types';

export function fetchAlerts(
  page: number,
  limit: number,
  unreadOnly: boolean,
): Promise<AlertsPage> {
  return apiRequest<AlertsPage>({
    url: '/api/v1/alerts',
    method: 'GET',
    params: { page, limit, unreadOnly },
  });
}

export function markAlertRead(id: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    url: `/api/v1/alerts/${id}/read`,
    method: 'PATCH',
  });
}

export function markAllAlertsRead(): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    url: '/api/v1/alerts/read-all',
    method: 'PATCH',
  });
}

export function deleteAlert(id: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    url: `/api/v1/alerts/${id}`,
    method: 'DELETE',
  });
}

export function deleteAllAlerts(): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    url: '/api/v1/alerts',
    method: 'DELETE',
  });
}
