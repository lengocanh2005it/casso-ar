import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomersModule } from '../customers/customers.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { RemindersModule } from '../reminders/reminders.module';
import { CreateManualTaskUseCase } from './application/create-manual-task.usecase';
import { DismissTaskUseCase } from './application/dismiss-task.usecase';
import { INTERNAL_TASK_REPOSITORY } from './application/internal-task-repository.port';
import { ListReceivableTasksUseCase } from './application/list-receivable-tasks.usecase';
import { ResolveTaskUseCase } from './application/resolve-task.usecase';
import { RunEscalationScanUseCase } from './application/run-escalation-scan.usecase';
import { InternalTaskOrmEntity } from './infrastructure/internal-task.orm-entity';
import { ReceivableClosedListener } from './infrastructure/receivable-closed.listener';
import { ReminderScanCompletedListener } from './infrastructure/reminder-scan-completed.listener';
import { TypeOrmInternalTaskRepository } from './infrastructure/typeorm-internal-task.repository';
import { InternalTasksController } from './presentation/internal-tasks.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([InternalTaskOrmEntity]),
    CustomersModule,
    OrganizationsModule,
    ReceivablesModule,
    RemindersModule,
  ],
  providers: [
    {
      provide: INTERNAL_TASK_REPOSITORY,
      useClass: TypeOrmInternalTaskRepository,
    },
    RunEscalationScanUseCase,
    ReminderScanCompletedListener,
    ReceivableClosedListener,
    CreateManualTaskUseCase,
    ResolveTaskUseCase,
    DismissTaskUseCase,
    ListReceivableTasksUseCase,
  ],
  controllers: [InternalTasksController],
  exports: [INTERNAL_TASK_REPOSITORY],
})
export class InternalTasksModule {}
