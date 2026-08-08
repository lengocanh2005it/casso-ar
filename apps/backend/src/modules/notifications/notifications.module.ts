import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CommonTokensModule } from '../../common/tokens/common-tokens.module';
import { CustomersModule } from '../customers/customers.module';
import { EmailTemplatesModule } from '../email-templates/email-templates.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { UsersModule } from '../users/users.module';
import { EmailService } from './application/email.service';
import { EMAIL_PROVIDER_ADAPTER } from './application/email-provider-adapter.port';
import { EMAIL_QUEUE_PORT } from './application/email-queue.port';
import { BullMqEmailQueue } from './infrastructure/email-queue.adapter';
import { EMAIL_QUEUE } from './infrastructure/email-queue.constants';
import { EmailQueueProcessor } from './infrastructure/email-queue.processor';
import { ResendEmailAdapter } from './infrastructure/resend-email.adapter';

@Module({
  imports: [
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
    CommonTokensModule,
    CustomersModule,
    EmailTemplatesModule,
    InvoicesModule,
    OrganizationsModule,
    ReceivablesModule,
    UsersModule,
  ],
  providers: [
    { provide: EMAIL_PROVIDER_ADAPTER, useClass: ResendEmailAdapter },
    { provide: EMAIL_QUEUE_PORT, useClass: BullMqEmailQueue },
    EmailService,
    EmailQueueProcessor,
  ],
  exports: [EMAIL_PROVIDER_ADAPTER, EMAIL_QUEUE_PORT, EmailService],
})
export class NotificationsModule {}
