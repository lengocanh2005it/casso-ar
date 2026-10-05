import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { InitiatePeriodChargeUseCase } from '../application/initiate-period-charge.usecase';
import { InitiatePlanUpgradeOrderUseCase } from '../application/initiate-plan-upgrade-order.usecase';
import { ProcessPlanPaymentWebhookUseCase } from '../application/process-plan-payment-webhook.usecase';
import { PayosController } from './payos.controller';

describe('PayosController', () => {
  function buildController() {
    const initiateUseCase = {
      execute: jest.fn().mockResolvedValue({ checkoutUrl: 'https://x' }),
    } as unknown as InitiatePlanUpgradeOrderUseCase;
    const processWebhookUseCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as ProcessPlanPaymentWebhookUseCase;
    const initiateChargeUseCase = {
      execute: jest.fn().mockResolvedValue({ checkoutUrl: 'https://y' }),
    } as unknown as InitiatePeriodChargeUseCase;
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    } as unknown as TenantContextService;
    const idempotency = {
      execute: jest.fn((_key, _headerKey, _dto, fn) => fn()),
    } as unknown as IdempotencyService;

    const controller = new PayosController(
      initiateUseCase,
      processWebhookUseCase,
      initiateChargeUseCase,
      tenantContext,
      idempotency,
    );
    return { controller, processWebhookUseCase };
  }

  it('passes the signed inner data to the receipt processor', async () => {
    const { controller, processWebhookUseCase } = buildController();

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

    expect(processWebhookUseCase.execute).toHaveBeenCalledWith({
      signature: 'sig',
      data: expect.objectContaining({
        orderCode: 100_000_001,
        code: '00',
      }),
    });
  });
});
