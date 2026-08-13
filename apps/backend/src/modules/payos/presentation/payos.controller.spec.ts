import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { ConfirmPeriodChargeUseCase } from '../application/confirm-period-charge.usecase';
import { ConfirmPlanUpgradeOrderUseCase } from '../application/confirm-plan-upgrade-order.usecase';
import { InitiatePeriodChargeUseCase } from '../application/initiate-period-charge.usecase';
import { InitiatePlanUpgradeOrderUseCase } from '../application/initiate-plan-upgrade-order.usecase';
import { PayosController } from './payos.controller';

describe('PayosController', () => {
  function buildController() {
    const initiateUseCase = {
      execute: jest.fn().mockResolvedValue({ checkoutUrl: 'https://x' }),
    } as unknown as InitiatePlanUpgradeOrderUseCase;
    const confirmUseCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConfirmPlanUpgradeOrderUseCase;
    const initiateChargeUseCase = {
      execute: jest.fn().mockResolvedValue({ checkoutUrl: 'https://y' }),
    } as unknown as InitiatePeriodChargeUseCase;
    const confirmChargeUseCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConfirmPeriodChargeUseCase;
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    } as unknown as TenantContextService;
    const idempotency = {
      execute: jest.fn((_key, _headerKey, _dto, fn) => fn()),
    } as unknown as IdempotencyService;

    const controller = new PayosController(
      initiateUseCase,
      confirmUseCase,
      initiateChargeUseCase,
      confirmChargeUseCase,
      tenantContext,
      idempotency,
    );
    return { controller, confirmUseCase, confirmChargeUseCase };
  }

  it('receiveWebhook calls BOTH confirm use cases (orderCode spaces are disjoint, so at most one ever matches a real row)', async () => {
    const { controller, confirmUseCase, confirmChargeUseCase } =
      buildController();

    await controller.receiveWebhook({
      code: '00',
      desc: 'success',
      success: true,
      data: {
        orderCode: 100_000_001,
        amount: 299_000,
        description: 'x',
        code: '00',
        desc: 'success',
      },
      signature: 'sig',
    });

    expect(confirmUseCase.execute).toHaveBeenCalledWith({
      orderCode: 100_000_001,
      paymentSucceeded: true,
    });
    expect(confirmChargeUseCase.execute).toHaveBeenCalledWith({
      orderCode: 100_000_001,
      paymentSucceeded: true,
    });
  });
});
