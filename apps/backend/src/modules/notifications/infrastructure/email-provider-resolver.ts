import { Inject, Injectable } from '@nestjs/common';
import { ACCESS_TOKEN_ENCRYPTION_KEY } from '../../bank-connections/application/token-encryption-key';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../../billing/application/subscription-repository.port';
import {
  type ISmtpConfigRepository,
  SMTP_CONFIG_REPOSITORY,
} from '../../smtp-config/application/smtp-config-repository.port';
import {
  EMAIL_PROVIDER_ADAPTER,
  type IEmailProviderAdapter,
} from '../application/email-provider-adapter.port';
import type { IEmailProviderResolver } from '../application/email-provider-resolver.port';
import { SmtpEmailAdapter } from './smtp-email.adapter';

@Injectable()
export class EmailProviderResolver implements IEmailProviderResolver {
  constructor(
    @Inject(EMAIL_PROVIDER_ADAPTER)
    private readonly resendAdapter: IEmailProviderAdapter,
    @Inject(SMTP_CONFIG_REPOSITORY)
    private readonly smtpConfigRepo: ISmtpConfigRepository,
    @Inject(ACCESS_TOKEN_ENCRYPTION_KEY)
    private readonly encryptionKey: string,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepo: ISubscriptionRepository,
  ) {}

  async resolve(
    organizationId: string,
    forceProvider?: 'RESEND',
  ): Promise<IEmailProviderAdapter> {
    if (forceProvider === 'RESEND') return this.resendAdapter;

    const subscription =
      await this.subscriptionRepo.findByOrganizationId(organizationId);
    if (!subscription?.canUseCustomSmtp) return this.resendAdapter;

    const config =
      await this.smtpConfigRepo.findByOrganizationId(organizationId);
    if (config?.isConnected()) {
      return new SmtpEmailAdapter(config, this.encryptionKey);
    }
    return this.resendAdapter;
  }
}
