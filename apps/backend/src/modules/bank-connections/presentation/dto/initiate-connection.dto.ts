import {
  IsOptional,
  IsUrl,
  IsUUID,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import {
  isCasRedirectUriAllowed,
  parseCasRedirectUriAllowlist,
} from '../../application/validate-cas-redirect-uri';

function IsAllowedCasRedirectUri(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isAllowedCasRedirectUri',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return true;
          return isCasRedirectUriAllowed(
            value,
            parseCasRedirectUriAllowlist(
              process.env.CAS_ID_REDIRECT_URI_ALLOWLIST,
            ),
          );
        },
        defaultMessage: () => 'Địa chỉ chuyển hướng không được phép.',
      },
    });
  };
}

export class InitiateConnectionDto {
  @IsUrl({ require_tld: false })
  @IsAllowedCasRedirectUri()
  redirectUri: string;

  @IsOptional()
  @IsUUID()
  bankConnectionId?: string;
}
