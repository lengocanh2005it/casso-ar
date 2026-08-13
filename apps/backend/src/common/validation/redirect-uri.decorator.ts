import { registerDecorator, type ValidationOptions } from 'class-validator';
import {
  isRedirectUriAllowed,
  parseRedirectUriAllowlist,
} from '../redirect-uri/allowlist';

// Shared class-validator decorator for the CAS ID and PayOS redirect-URI
// allowlists. The env var holding the allowlist is passed by the call site
// so both flows stay behind one implementation (fail-closed: an empty
// allowlist — or a non-string value — is rejected, never passed through).
export function IsAllowedRedirectUri(
  envVar: string,
  validationOptions?: ValidationOptions,
) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isAllowedRedirectUri',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          return isRedirectUriAllowed(
            value,
            parseRedirectUriAllowlist(process.env[envVar]),
          );
        },
        defaultMessage: () => 'Địa chỉ chuyển hướng không được phép.',
      },
    });
  };
}
