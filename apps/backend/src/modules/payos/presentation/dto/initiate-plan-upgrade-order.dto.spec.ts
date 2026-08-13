import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InitiatePlanUpgradeOrderDto } from './initiate-plan-upgrade-order.dto';

describe('InitiatePlanUpgradeOrderDto', () => {
  const previousAllowlist = process.env.PAYOS_RETURN_URL_ALLOWLIST;

  afterEach(() => {
    if (previousAllowlist === undefined) {
      delete process.env.PAYOS_RETURN_URL_ALLOWLIST;
    } else {
      process.env.PAYOS_RETURN_URL_ALLOWLIST = previousAllowlist;
    }
  });

  it('rejects a return URL outside the configured allowlist', async () => {
    process.env.PAYOS_RETURN_URL_ALLOWLIST = 'https://app.casso.vn';

    const errors = await validate(
      plainToInstance(InitiatePlanUpgradeOrderDto, {
        targetPlanId: 'BUSINESS',
        returnUrl: 'https://evil.example/callback',
        cancelUrl: 'https://app.casso.vn/cancel',
      }),
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'returnUrl',
          constraints: expect.objectContaining({
            isAllowedRedirectUri: expect.any(String),
          }),
        }),
      ]),
    );
  });

  it('accepts a return URL on a configured origin', async () => {
    process.env.PAYOS_RETURN_URL_ALLOWLIST = 'https://app.casso.vn';

    const errors = await validate(
      plainToInstance(InitiatePlanUpgradeOrderDto, {
        targetPlanId: 'BUSINESS',
        returnUrl: 'https://app.casso.vn/billing?status=success',
        cancelUrl: 'https://app.casso.vn/billing?status=cancelled',
      }),
    );

    expect(errors).toHaveLength(0);
  });

  it('rejects every redirect URI when the allowlist is empty (fail closed)', async () => {
    delete process.env.PAYOS_RETURN_URL_ALLOWLIST;

    const errors = await validate(
      plainToInstance(InitiatePlanUpgradeOrderDto, {
        targetPlanId: 'BUSINESS',
        returnUrl: 'https://app.casso.vn/billing',
        cancelUrl: 'https://app.casso.vn/billing',
      }),
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'returnUrl',
          constraints: expect.objectContaining({
            isAllowedRedirectUri: expect.any(String),
          }),
        }),
        expect.objectContaining({
          property: 'cancelUrl',
          constraints: expect.objectContaining({
            isAllowedRedirectUri: expect.any(String),
          }),
        }),
      ]),
    );
  });
});
