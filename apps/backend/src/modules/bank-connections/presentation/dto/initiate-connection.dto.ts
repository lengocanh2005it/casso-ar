import { IsOptional, IsUrl, IsUUID } from 'class-validator';
import { IsAllowedRedirectUri } from '../../../../common/validation/redirect-uri.decorator';

const CAS_ID_REDIRECT_ALLOWLIST_ENV = 'CAS_ID_REDIRECT_URI_ALLOWLIST';

export class InitiateConnectionDto {
  @IsUrl({ require_tld: false })
  @IsAllowedRedirectUri(CAS_ID_REDIRECT_ALLOWLIST_ENV)
  redirectUri: string;

  @IsOptional()
  @IsUUID()
  bankConnectionId?: string;
}
