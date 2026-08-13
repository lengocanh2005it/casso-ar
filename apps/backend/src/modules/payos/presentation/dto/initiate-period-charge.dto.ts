import { IsUrl } from 'class-validator';
import { IsAllowedPayosRedirectUri } from './is-allowed-payos-redirect-uri.decorator';

export class InitiatePeriodChargeDto {
  @IsUrl({ require_tld: false })
  @IsAllowedPayosRedirectUri()
  returnUrl: string;

  @IsUrl({ require_tld: false })
  @IsAllowedPayosRedirectUri()
  cancelUrl: string;
}
