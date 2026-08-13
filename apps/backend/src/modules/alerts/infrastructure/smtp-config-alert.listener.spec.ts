import { AlertType } from '../domain/alert';
import { SmtpConfigAlertListener } from './smtp-config-alert.listener';

function buildDeps() {
  return {
    membershipRepo: {
      findOwnerByOrganization: jest
        .fn()
        .mockResolvedValue({ userId: 'owner-1' }),
    },
    createAlert: { execute: jest.fn().mockResolvedValue(undefined) },
    tenantContext: { run: (_user: unknown, cb: () => unknown) => cb() },
  };
}

describe('SmtpConfigAlertListener', () => {
  it('creates a SMTP_FAILED alert for the org OWNER', async () => {
    const deps = buildDeps();
    const listener = new SmtpConfigAlertListener(
      deps.membershipRepo as any,
      deps.createAlert as any,
      deps.tenantContext as any,
    );

    await listener.handle({ organizationId: 'org-1', smtpConfigId: 'smtp-1' });

    expect(deps.createAlert.execute).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'owner-1',
      type: AlertType.SMTP_FAILED,
      entityType: 'smtp_config',
      entityId: 'smtp-1',
    });
  });

  it('does nothing when the organization has no OWNER membership', async () => {
    const deps = buildDeps();
    deps.membershipRepo.findOwnerByOrganization.mockResolvedValue(null);
    const listener = new SmtpConfigAlertListener(
      deps.membershipRepo as any,
      deps.createAlert as any,
      deps.tenantContext as any,
    );

    await listener.handle({ organizationId: 'org-1', smtpConfigId: 'smtp-1' });

    expect(deps.createAlert.execute).not.toHaveBeenCalled();
  });
});
