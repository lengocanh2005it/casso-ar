import { EventEmitter2 } from '@nestjs/event-emitter';
import { firstValueFrom } from 'rxjs';
import { AlertType } from '../domain/alert';
import { AlertsController } from './alerts.controller';

function buildController() {
  const listAlerts = { execute: jest.fn() };
  const markAlertRead = { execute: jest.fn().mockResolvedValue(undefined) };
  const markAllAlertsRead = { execute: jest.fn().mockResolvedValue(undefined) };
  const deleteAlert = { execute: jest.fn().mockResolvedValue(undefined) };
  const deleteAllAlerts = { execute: jest.fn().mockResolvedValue(undefined) };
  const eventEmitter = new EventEmitter2();
  const tenantContext = {
    getCurrentUser: jest.fn().mockReturnValue({ userId: 'user-1' }),
  };
  const controller = new AlertsController(
    listAlerts as any,
    markAlertRead as any,
    markAllAlertsRead as any,
    deleteAlert as any,
    deleteAllAlerts as any,
    eventEmitter,
    tenantContext as any,
  );
  return {
    controller,
    listAlerts,
    markAlertRead,
    markAllAlertsRead,
    deleteAlert,
    deleteAllAlerts,
    eventEmitter,
    tenantContext,
  };
}

describe('AlertsController', () => {
  describe('GET /alerts', () => {
    it('maps query params to ListAlertsUseCase and the page to AlertsPageResponseDto', async () => {
      const { controller, listAlerts } = buildController();
      listAlerts.execute.mockResolvedValue({
        items: [
          {
            id: 'alert-1',
            type: AlertType.SMTP_FAILED,
            entityType: 'smtp_config',
            entityId: 'smtp-1',
            isRead: () => false,
            createdAt: new Date('2026-08-13T00:00:00Z'),
          },
        ],
        total: 1,
        unreadCount: 1,
      });

      const result = await controller.list({
        page: 2,
        limit: 10,
        unreadOnly: true,
      });

      expect(listAlerts.execute).toHaveBeenCalledWith(2, 10, true);
      expect(result).toEqual({
        items: [
          {
            id: 'alert-1',
            type: AlertType.SMTP_FAILED,
            entityType: 'smtp_config',
            entityId: 'smtp-1',
            isRead: false,
            createdAt: '2026-08-13T00:00:00.000Z',
          },
        ],
        total: 1,
        unreadCount: 1,
      });
    });
  });

  describe('PATCH /alerts/:id/read', () => {
    it('delegates to MarkAlertReadUseCase', async () => {
      const { controller, markAlertRead } = buildController();

      const result = await controller.read('alert-1');

      expect(markAlertRead.execute).toHaveBeenCalledWith('alert-1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('PATCH /alerts/read-all', () => {
    it('delegates to MarkAllAlertsReadUseCase', async () => {
      const { controller, markAllAlertsRead } = buildController();

      const result = await controller.readAll();

      expect(markAllAlertsRead.execute).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });

  describe('DELETE /alerts/:id', () => {
    it('delegates to DeleteAlertUseCase', async () => {
      const { controller, deleteAlert } = buildController();

      const result = await controller.remove('alert-1');

      expect(deleteAlert.execute).toHaveBeenCalledWith('alert-1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('DELETE /alerts', () => {
    it('delegates to DeleteAllAlertsUseCase', async () => {
      const { controller, deleteAllAlerts } = buildController();

      const result = await controller.removeAll();

      expect(deleteAllAlerts.execute).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });

  describe('GET /alerts/stream', () => {
    it('emits an SSE message only for ALERT_CREATED_FOR_USER events matching the connected userId', async () => {
      const { controller, eventEmitter } = buildController();

      const messagePromise = firstValueFrom(controller.stream());
      eventEmitter.emit('alert.created-for-user', {
        userId: 'someone-else',
        unreadCount: 9,
      });
      eventEmitter.emit('alert.created-for-user', {
        userId: 'user-1',
        unreadCount: 3,
      });

      const message = await messagePromise;

      expect(message).toEqual({
        data: { type: 'alert.created', unreadCount: 3 },
      });
    });
  });
});
