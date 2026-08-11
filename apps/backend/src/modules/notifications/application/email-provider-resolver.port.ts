import type { IEmailProviderAdapter } from './email-provider-adapter.port';

export interface IEmailProviderResolver {
  /** RESEND bypasses SMTP config lookup for fallback and warning emails. */
  resolve(
    organizationId: string,
    forceProvider?: 'RESEND',
  ): Promise<IEmailProviderAdapter>;
}

export const EMAIL_PROVIDER_RESOLVER = Symbol('EMAIL_PROVIDER_RESOLVER');
