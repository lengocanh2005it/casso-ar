import { AdminController } from './admin.controller';

describe('AdminController', () => {
  describe('date-only "to" range handling', () => {
    const getAiUsageAggregateUseCase = {
      execute: jest.fn().mockResolvedValue([]),
    };
    const getAiUsageTrendUseCase = { execute: jest.fn().mockResolvedValue([]) };
    const controller = new AdminController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      getAiUsageAggregateUseCase as never,
      getAiUsageTrendUseCase as never,
      {} as never,
      {} as never,
      {} as never,
    );

    afterEach(() => jest.clearAllMocks());

    it('extends a date-only "to" to the end of that day so same-day ranges are not empty', async () => {
      await controller.getAiUsage({ from: '2026-08-15', to: '2026-08-15' });

      const { from, to } = getAiUsageAggregateUseCase.execute.mock.calls[0][0];
      expect(from).toEqual(new Date('2026-08-15T00:00:00.000Z'));
      expect(to).toEqual(new Date('2026-08-15T23:59:59.999Z'));
    });

    it('applies the same end-of-day extension to the trend endpoint', async () => {
      await controller.getAiUsageTrend({
        from: '2026-08-01',
        to: '2026-08-07',
      });

      const { to } = getAiUsageTrendUseCase.execute.mock.calls[0][0];
      expect(to).toEqual(new Date('2026-08-07T23:59:59.999Z'));
    });
  });
});
