import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CommonTokensModule } from '../../common/tokens/common-tokens.module';
import { BankConnectionsModule } from '../bank-connections/bank-connections.module';
import { BillingModule } from '../billing/billing.module';
import { CustomersModule } from '../customers/customers.module';
import { EmailTemplatesModule } from '../email-templates/email-templates.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { SmtpConfigModule } from '../smtp-config/smtp-config.module';
import { UsersModule } from '../users/users.module';
import { EmailService } from './application/email.service';
import { EMAIL_PROVIDER_ADAPTER } from './application/email-provider-adapter.port';
import { EMAIL_PROVIDER_RESOLVER } from './application/email-provider-resolver.port';
import { EMAIL_QUEUE_PORT } from './application/email-queue.port';
import { BankConnectionStatusListener } from './infrastructure/bank-connection-status.listener';
import { EmailProviderResolver } from './infrastructure/email-provider-resolver';
import { BullMqEmailQueue } from './infrastructure/email-queue.adapter';
import { EMAIL_QUEUE } from './infrastructure/email-queue.constants';
import { EmailQueueProcessor } from './infrastructure/email-queue.processor';
import { ResendEmailAdapter } from './infrastructure/resend-email.adapter';

@Module({
  imports: [
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
    CommonTokensModule,
    BankConnectionsModule,
    BillingModule,
    CustomersModule,
    EmailTemplatesModule,
    InvoicesModule,
    OrganizationsModule,
    ReceivablesModule,
    SmtpConfigModule,
    UsersModule,
  ],
  providers: [
    { provide: EMAIL_PROVIDER_ADAPTER, useClass: ResendEmailAdapter },
    { provide: EMAIL_PROVIDER_RESOLVER, useClass: EmailProviderResolver },
    { provide: EMAIL_QUEUE_PORT, useClass: BullMqEmailQueue },
    EmailService,
    EmailQueueProcessor,
    BankConnectionStatusListener,
  ],
  exports: [EMAIL_PROVIDER_ADAPTER, EMAIL_QUEUE_PORT, EmailService],
})
export class NotificationsModule {}
