import { CustomerCreditsController } from './customer-credits.controller';

describe('CustomerCreditsController', () => {
  it('delegates the customer id and returns the read contract', async () => {
    const useCase = {
      execute: jest.fn().mockResolvedValue({
        customerId: 'cust-1',
        totalAvailableAmount: 5_000_000,
        items: [],
      }),
    };
    const controller = new CustomerCreditsController(useCase as any);

    await expect(controller.list('cust-1')).resolves.toEqual({
      customerId: 'cust-1',
      totalAvailableAmount: 5_000_000,
      items: [],
    });
    expect(useCase.execute).toHaveBeenCalledWith({ customerId: 'cust-1' });
  });
});
