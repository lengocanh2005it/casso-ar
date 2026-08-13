import { ErrorCode } from '../../../common/errors/error-code';
import { Alert, AlertType } from '../domain/alert';
import { MarkAlertReadUseCase } from './mark-alert-read.usecase';

function buildAlert() {
  return new Alert({
    id: 'alert-1',
    organizationId: 'org-1',
    userId: 'user-1',
    type: AlertType.SMTP_FAILED,
    entityType: 'smtp_config',
    entityId: 'smtp-1',
    readAt: null,
    createdAt: new Date('2026-08-13T00:00:00Z'),
  });
}

describe('MarkAlertReadUseCase', () => {
  it('marks the alert read when it exists and belongs to the current user', async () => {
    const alertRepo = {
      findByIdForUser: jest.fn().mockResolvedValue(buildAlert()),
      markRead: jest.fn().mockResolvedValue(undefined),
    };
    const tenantContext = {
      getCurrentUser: jest.fn().mockReturnValue({ userId: 'user-1' }),
    };
    const useCase = new MarkAlertReadUseCase(
      alertRepo as any,
      tenantContext as any,
    );

    await useCase.execute('alert-1');

    expect(alertRepo.findByIdForUser).toHaveBeenCalledWith('alert-1', 'user-1');
    expect(alertRepo.markRead).toHaveBeenCalledWith('alert-1', 'user-1');
  });

  it('throws NOT_FOUND when the alert does not exist or is not owned by the user', async () => {
    const alertRepo = {
      findByIdForUser: jest.fn().mockResolvedValue(null),
      markRead: jest.fn(),
    };
    const tenantContext = {
      getCurrentUser: jest.fn().mockReturnValue({ userId: 'user-1' }),
    };
    const useCase = new MarkAlertReadUseCase(
      alertRepo as any,
      tenantContext as any,
    );

    await expect(useCase.execute('missing')).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
    expect(alertRepo.markRead).not.toHaveBeenCalled();
  });
});
