import { AlertType } from '../domain/alert';
import { AlertsController } from './alerts.controller';

function buildController() {
  const listAlerts = { execute: jest.fn() };
  const controller = new AlertsController(listAlerts as any);
  return { controller, listAlerts };
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
});
