import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { BankConnectionsModule } from '../bank-connections/bank-connections.module';
import { BillingModule } from '../billing/billing.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { DeleteSmtpConfigUseCase } from './application/delete-smtp-config.usecase';
import { GetSmtpConfigUseCase } from './application/get-smtp-config.usecase';
import { SMTP_CONFIG_REPOSITORY } from './application/smtp-config-repository.port';
import { SMTP_HOST_RESOLVER } from './application/smtp-host-resolver.port';
import {
  SMTP_TRANSPORT_FACTORY,
  TestAndSaveSmtpConfigUseCase,
} from './application/test-and-save-smtp-config.usecase';
import { NodeDnsSmtpHostResolver } from './infrastructure/node-dns-smtp-host-resolver';
import { createSmtpTransport } from './infrastructure/nodemailer-smtp-transport';
import { OrganizationSmtpConfigOrmEntity } from './infrastructure/organization-smtp-config.orm-entity';
import { TypeOrmSmtpConfigRepository } from './infrastructure/typeorm-smtp-config.repository';
import { SmtpConfigController } from './presentation/smtp-config.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrganizationSmtpConfigOrmEntity]),
    IdempotencyModule,
    BankConnectionsModule,
    BillingModule,
    OrganizationsModule,
    UsersModule,
  ],
  providers: [
    { provide: SMTP_CONFIG_REPOSITORY, useClass: TypeOrmSmtpConfigRepository },
    { provide: SMTP_TRANSPORT_FACTORY, useValue: createSmtpTransport },
    { provide: SMTP_HOST_RESOLVER, useClass: NodeDnsSmtpHostResolver },
    TestAndSaveSmtpConfigUseCase,
    GetSmtpConfigUseCase,
    DeleteSmtpConfigUseCase,
  ],
  controllers: [SmtpConfigController],
  exports: [SMTP_CONFIG_REPOSITORY],
})
export class SmtpConfigModule {}
