import { ErrorCode } from '../../../common/errors/error-code';
import { Alert, AlertType } from '../domain/alert';
import { DeleteAlertUseCase } from './delete-alert.usecase';

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

describe('DeleteAlertUseCase', () => {
  it('deletes the alert when it exists and belongs to the current user', async () => {
    const alertRepo = {
      findByIdForUser: jest.fn().mockResolvedValue(buildAlert()),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const tenantContext = {
      getCurrentUser: jest.fn().mockReturnValue({ userId: 'user-1' }),
    };
    const useCase = new DeleteAlertUseCase(
      alertRepo as any,
      tenantContext as any,
    );

    await useCase.execute('alert-1');

    expect(alertRepo.delete).toHaveBeenCalledWith('alert-1', 'user-1');
  });

  it('throws NOT_FOUND when the alert does not exist or is not owned by the user', async () => {
    const alertRepo = {
      findByIdForUser: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
    };
    const tenantContext = {
      getCurrentUser: jest.fn().mockReturnValue({ userId: 'user-1' }),
    };
    const useCase = new DeleteAlertUseCase(
      alertRepo as any,
      tenantContext as any,
    );

    await expect(useCase.execute('missing')).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
    expect(alertRepo.delete).not.toHaveBeenCalled();
  });
});
