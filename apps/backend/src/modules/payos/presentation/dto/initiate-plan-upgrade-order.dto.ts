import { PlanId } from '@casso-ar/shared-types';
import { IsEnum, IsUrl } from 'class-validator';
import { IsAllowedRedirectUri } from '../../../../common/validation/redirect-uri.decorator';

const PAYOS_RETURN_URL_ALLOWLIST_ENV = 'PAYOS_RETURN_URL_ALLOWLIST';

export class InitiatePlanUpgradeOrderDto {
  @IsEnum(PlanId)
  targetPlanId: PlanId;

  @IsUrl({ require_tld: false })
  @IsAllowedRedirectUri(PAYOS_RETURN_URL_ALLOWLIST_ENV)
  returnUrl: string;

  @IsUrl({ require_tld: false })
  @IsAllowedRedirectUri(PAYOS_RETURN_URL_ALLOWLIST_ENV)
  cancelUrl: string;
}
