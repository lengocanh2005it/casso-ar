import { registerDecorator, type ValidationOptions } from 'class-validator';
import {
  isPayosRedirectUriAllowed,
  parsePayosRedirectUriAllowlist,
} from '../../application/validate-payos-redirect-uri';

export function IsAllowedPayosRedirectUri(
  validationOptions?: ValidationOptions,
) {
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
