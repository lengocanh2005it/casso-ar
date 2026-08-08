// biome-ignore assist/source/organizeImports: BankAccountsModule must evaluate before AuthModule to avoid a runtime module cycle.
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtStrategy } from './common/auth/jwt.strategy';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { AuditModule } from './common/audit/audit.module';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { TenancyModule } from './common/tenancy/tenancy.module';
import { CommonTokensModule } from './common/tokens/common-tokens.module';
import { TenantContextInterceptor } from './common/tenancy/tenant-context.interceptor';
import { getBullMqConfig } from './config/bullmq.config';
import { getJwtModuleOptions } from './config/jwt.config';
import { getTypeOrmConfig } from './config/typeorm.config';
import { BankAccountsModule } from './modules/bank-accounts/bank-accounts.module';
import { BankConnectionsModule } from './modules/bank-connections/bank-connections.module';
import { BillingModule } from './modules/billing/billing.module';
import { CollectionActivityModule } from './modules/collection-activity/collection-activity.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DisputesModule } from './modules/disputes/disputes.module';
import { EmailTemplatesModule } from './modules/email-templates/email-templates.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReceivablesModule } from './modules/receivables/receivables.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { UsersModule } from './modules/users/users.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { AuthModule } from './modules/auth/auth.module';
import { EmailVerifiedGuard } from './modules/auth/presentation/email-verified.guard';
import { ExceptionQueueModule } from './modules/exception-queue/exception-queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: getTypeOrmConfig,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: getBullMqConfig,
    }),
    EventEmitterModule.forRoot(),
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: getJwtModuleOptions,
    }),
    TenancyModule,
    CommonTokensModule,
    IdempotencyModule,
    AuditModule,
    OrganizationsModule,
    BillingModule,
    BankConnectionsModule,
    BankAccountsModule,
    AuthModule,
    CustomersModule,
    EmailTemplatesModule,
    InvoicesModule,
    ReceivablesModule,
    DisputesModule,
    CollectionActivityModule,
    PaymentsModule,
    UsersModule,
    RemindersModule,
    NotificationsModule,
    WebhooksModule,
    ExceptionQueueModule,
  ],
  providers: [
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: EmailVerifiedGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule {}
