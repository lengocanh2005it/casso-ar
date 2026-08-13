import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EVENT_PUBLISHER } from '../../common/events/event-publisher.port';
import { NestEventPublisherAdapter } from '../../common/events/nest-event-publisher.adapter';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ALERT_REPOSITORY } from './application/alert-repository.port';
import { CreateAlertUseCase } from './application/create-alert.usecase';
import { DeleteAlertUseCase } from './application/delete-alert.usecase';
import { DeleteAllAlertsUseCase } from './application/delete-all-alerts.usecase';
import { ListAlertsUseCase } from './application/list-alerts.usecase';
import { MarkAlertReadUseCase } from './application/mark-alert-read.usecase';
import { MarkAllAlertsReadUseCase } from './application/mark-all-alerts-read.usecase';
import { AlertOrmEntity } from './infrastructure/alert.orm-entity';
import { BankConnectionAlertListener } from './infrastructure/bank-connection-alert.listener';
import { ReminderScanAlertListener } from './infrastructure/reminder-scan-alert.listener';
import { SmtpConfigAlertListener } from './infrastructure/smtp-config-alert.listener';
import { TypeOrmAlertRepository } from './infrastructure/typeorm-alert.repository';
import { AlertsController } from './presentation/alerts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AlertOrmEntity]), OrganizationsModule],
  controllers: [AlertsController],
  providers: [
    { provide: ALERT_REPOSITORY, useClass: TypeOrmAlertRepository },
    { provide: EVENT_PUBLISHER, useClass: NestEventPublisherAdapter },
    CreateAlertUseCase,
    ListAlertsUseCase,
    MarkAlertReadUseCase,
    MarkAllAlertsReadUseCase,
    DeleteAlertUseCase,
    DeleteAllAlertsUseCase,
    BankConnectionAlertListener,
    SmtpConfigAlertListener,
    ReminderScanAlertListener,
  ],
  exports: [ALERT_REPOSITORY],
})
export class AlertsModule {}
