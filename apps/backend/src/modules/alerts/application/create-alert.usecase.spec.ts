import { AlertType } from '../domain/alert';
import {
  ALERT_CREATED_FOR_USER,
  CreateAlertUseCase,
} from './create-alert.usecase';

describe('CreateAlertUseCase', () => {
  it('upserts an unread Alert and emits ALERT_CREATED_FOR_USER with the fresh unread count', async () => {
    const alertRepo = {
      upsertUnread: jest.fn().mockResolvedValue(undefined),
      countUnread: jest.fn().mockResolvedValue(2),
    };
    const eventPublisher = { emit: jest.fn(), emitAsync: jest.fn() };
    const useCase = new CreateAlertUseCase(
      alertRepo as any,
      eventPublisher as any,
    );

    await useCase.execute({
      organizationId: 'org-1',
      userId: 'user-1',
      type: AlertType.SMTP_FAILED,
      entityType: 'smtp_config',
      entityId: 'smtp-1',
    });

    expect(alertRepo.upsertUnread).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        type: AlertType.SMTP_FAILED,
        entityType: 'smtp_config',
        entityId: 'smtp-1',
        readAt: null,
      }),
    );
    expect(alertRepo.countUnread).toHaveBeenCalledWith('user-1');
    expect(eventPublisher.emit).toHaveBeenCalledWith(ALERT_CREATED_FOR_USER, {
      userId: 'user-1',
      unreadCount: 2,
    });
  });
});
