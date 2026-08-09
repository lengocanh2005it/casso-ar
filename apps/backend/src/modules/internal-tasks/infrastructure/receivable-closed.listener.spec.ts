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
});
