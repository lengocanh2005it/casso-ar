import { LedgerController } from './ledger.controller';

describe('LedgerController', () => {
  it('delegates list to the use case with mapped filters', async () => {
    const listLedgerEvents = {
      execute: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const controller = new LedgerController(listLedgerEvents as never);

    await controller.list({
      subjectType: 'RECEIVABLE' as any,
      subjectId: 'r-1',
      page: 2,
      limit: 10,
    });

    expect(listLedgerEvents.execute).toHaveBeenCalledWith({
      filters: {
        subjectType: 'RECEIVABLE',
        subjectId: 'r-1',
        kind: undefined,
      },
      page: 2,
      limit: 10,
    });
  });
});
