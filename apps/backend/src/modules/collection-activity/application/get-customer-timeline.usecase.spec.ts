import {
  CollectionActivity,
  CollectionActivityType,
} from '../domain/collection-activity';
import { GetCustomerTimelineUseCase } from './get-customer-timeline.usecase';

describe('GetCustomerTimelineUseCase', () => {
  it('passes a caller-supplied limit down to the repository', async () => {
    const activityRepo = {
      create: jest.fn(),
      findByReceivableId: jest.fn(),
      findByCustomerId: jest.fn().mockResolvedValue([]),
    };

    const useCase = new GetCustomerTimelineUseCase(activityRepo as any);

    await useCase.execute('cust-1', 25);

    expect(activityRepo.findByCustomerId).toHaveBeenCalledWith('cust-1', 25);
  });

  it('returns activities across all receivables for the customer', async () => {
    const activities = [
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
    ];
    const activityRepo = {
      create: jest.fn(),
      findByReceivableId: jest.fn(),
      findByCustomerId: jest.fn().mockResolvedValue(activities),
    };

    const useCase = new GetCustomerTimelineUseCase(activityRepo as any);
    const result = await useCase.execute('cust-1');

    expect(result).toBe(activities);
    expect(activityRepo.findByCustomerId).toHaveBeenCalledWith('cust-1', 100);
  });
});
