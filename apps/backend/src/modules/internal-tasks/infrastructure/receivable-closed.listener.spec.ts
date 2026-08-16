import { Logger } from '@nestjs/common';
import { ReceivableClosedListener } from './receivable-closed.listener';

describe('ReceivableClosedListener', () => {
  it('dismisses open tasks for a closed receivable in a tenant transaction', async () => {
    const internalTaskRepo = {
      dismissOpenByReceivableId: jest.fn().mockResolvedValue(undefined),
    };
    const tenantContext = {
      run: jest.fn((_context, callback) => callback()),
    };
    const dataSource = {
      transaction: jest.fn(async (callback) => callback({})),
    };
    const listener = new ReceivableClosedListener(
      internalTaskRepo as any,
      tenantContext as any,
      dataSource as any,
    );

    await listener.handle({ receivableId: 'rec-1', organizationId: 'org-1' });

    expect(tenantContext.run).toHaveBeenCalledWith(
      { userId: 'system', organizationId: 'org-1', role: 'OWNER' },
      expect.any(Function),
    );
    expect(internalTaskRepo.dismissOpenByReceivableId).toHaveBeenCalledWith(
      'rec-1',
      expect.anything(),
    );
  });

  it('logs and swallows listener errors instead of rejecting, since the event is fire-and-forget', async () => {
    const internalTaskRepo = {
      dismissOpenByReceivableId: jest
        .fn()
        .mockRejectedValue(new Error('db down')),
    };
    const tenantContext = {
      run: jest.fn((_context, callback) => callback()),
    };
    const dataSource = {
      transaction: jest.fn(async (callback) => callback({})),
    };
    const listener = new ReceivableClosedListener(
      internalTaskRepo as any,
      tenantContext as any,
      dataSource as any,
    );
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(
      listener.handle({ receivableId: 'rec-1', organizationId: 'org-1' }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        receivableId: 'rec-1',
        organizationId: 'org-1',
        error: 'db down',
      }),
    );
    errorSpy.mockRestore();
  });
});
