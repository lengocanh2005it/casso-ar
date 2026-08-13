import { PlanId } from '@casso-ledger/shared-types';
import {
  IsEnum,
  IsUrl,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import {
  isPayosRedirectUriAllowed,
  parsePayosRedirectUriAllowlist,
} from '../../application/validate-payos-redirect-uri';

function IsAllowedPayosRedirectUri(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isAllowedPayosRedirectUri',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return true;
          return isPayosRedirectUriAllowed(
            value,
            parsePayosRedirectUriAllowlist(
              process.env.PAYOS_RETURN_URL_ALLOWLIST,
            ),
          );
        },
        defaultMessage: () => 'Địa chỉ chuyển hướng không được phép.',
      },
    });
  };
}

export class InitiatePlanUpgradeOrderDto {
  @IsEnum(PlanId)
  targetPlanId: PlanId;

  @IsUrl({ require_tld: false })
  @IsAllowedPayosRedirectUri()
  returnUrl: string;

  @IsUrl({ require_tld: false })
  @IsAllowedPayosRedirectUri()
  cancelUrl: string;
}
