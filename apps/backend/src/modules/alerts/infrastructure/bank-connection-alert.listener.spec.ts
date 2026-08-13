import { AlertType } from '../domain/alert';
import { BankConnectionAlertListener } from './bank-connection-alert.listener';

function buildDeps() {
  return {
    membershipRepo: {
      findOwnerByOrganization: jest
        .fn()
        .mockResolvedValue({ userId: 'owner-1' }),
    },
    createAlert: { execute: jest.fn().mockResolvedValue(undefined) },
    tenantContext: {
      run: (_user: unknown, cb: () => unknown) => cb(),
    },
  };
}

describe('BankConnectionAlertListener', () => {
  it('maps REQUIRES_REAUTHORIZATION to BANK_CONNECTION_NEEDS_REAUTH', async () => {
    const deps = buildDeps();
    const listener = new BankConnectionAlertListener(
      deps.membershipRepo as any,
      deps.createAlert as any,
      deps.tenantContext as any,
    );

    await listener.handle({
      bankConnectionId: 'conn-1',
      organizationId: 'org-1',
      status: 'REQUIRES_REAUTHORIZATION',
    });

    expect(deps.createAlert.execute).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'owner-1',
      type: AlertType.BANK_CONNECTION_NEEDS_REAUTH,
      entityType: 'bank_connection',
      entityId: 'conn-1',
    });
  });

  it('maps ERROR to BANK_CONNECTION_ERROR', async () => {
    const deps = buildDeps();
    const listener = new BankConnectionAlertListener(
      deps.membershipRepo as any,
      deps.createAlert as any,
      deps.tenantContext as any,
    );

    await listener.handle({
      bankConnectionId: 'conn-1',
      organizationId: 'org-1',
      status: 'ERROR',
    });

    expect(deps.createAlert.execute).toHaveBeenCalledWith(
      expect.objectContaining({ type: AlertType.BANK_CONNECTION_ERROR }),
    );
  });

  it('does nothing when the organization has no OWNER membership', async () => {
    const deps = buildDeps();
    deps.membershipRepo.findOwnerByOrganization.mockResolvedValue(null);
    const listener = new BankConnectionAlertListener(
      deps.membershipRepo as any,
      deps.createAlert as any,
      deps.tenantContext as any,
    );

    await listener.handle({
      bankConnectionId: 'conn-1',
      organizationId: 'org-1',
      status: 'ERROR',
    });

    expect(deps.createAlert.execute).not.toHaveBeenCalled();
  });

  it('swallows errors from CreateAlertUseCase (never lets a listener crash the emitter)', async () => {
    const deps = buildDeps();
    deps.createAlert.execute.mockRejectedValue(new Error('db down'));
    const listener = new BankConnectionAlertListener(
      deps.membershipRepo as any,
      deps.createAlert as any,
      deps.tenantContext as any,
    );

    await expect(
      listener.handle({
        bankConnectionId: 'conn-1',
        organizationId: 'org-1',
        status: 'ERROR',
      }),
    ).resolves.toBeUndefined();
  });
});
