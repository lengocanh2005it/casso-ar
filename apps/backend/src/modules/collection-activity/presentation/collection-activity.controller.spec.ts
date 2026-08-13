import { CollectionActivityType } from '../common/collection-activity-types';
import { CollectionActivity } from '../domain/collection-activity';
import { CollectionActivityController } from './collection-activity.controller';

describe('CollectionActivityController', () => {
  function buildController() {
    const recordManualActivityUseCase = { execute: jest.fn() } as any;
    const getReceivableTimelineUseCase = { execute: jest.fn() } as any;
    const getCustomerTimelineUseCase = { execute: jest.fn() } as any;
    const getOrganizationTimelineUseCase = { execute: jest.fn() } as any;
    const tenantContext = {
      getCurrentUser: jest.fn().mockReturnValue({ userId: 'u1' }),
    } as any;
    const idempotency = {
      execute: jest.fn((_key, _headerKey, _dto, fn) => fn()),
    } as any;

    const controller = new CollectionActivityController(
      recordManualActivityUseCase,
      getReceivableTimelineUseCase,
      getCustomerTimelineUseCase,
      getOrganizationTimelineUseCase,
      tenantContext,
      idempotency,
    );
    return { controller, getOrganizationTimelineUseCase };
  }

  it('organizationTimeline maps use case output through toCollectionActivityResponse', async () => {
    const { controller, getOrganizationTimelineUseCase } = buildController();
    getOrganizationTimelineUseCase.execute.mockResolvedValue({
      items: [
        new CollectionActivity({
          id: 'act-1',
          organizationId: 'org-1',
          receivableId: 'rec-1',
          customerId: 'cust-1',
          activityType: CollectionActivityType.PAYMENT_RECEIVED,
          description: 'x',
          metadata: {},
          createdByUserId: null,
          createdAt: new Date('2026-08-03'),
        }),
      ],
      total: 1,
      page: 1,
      limit: 20,
    });

    const result = await controller.organizationTimeline({
      page: 1,
      limit: 20,
    });

    expect(getOrganizationTimelineUseCase.execute).toHaveBeenCalledWith(1, 20);
    expect(result.items).toEqual([
      expect.objectContaining({ id: 'act-1', description: 'x' }),
    ]);
    expect(result.total).toBe(1);
  });
});
