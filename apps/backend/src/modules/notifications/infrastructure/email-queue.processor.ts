import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Job } from 'bullmq';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import {
  type IReminderExecutionRepository,
  REMINDER_EXECUTION_REPOSITORY,
} from '../../reminders/application/reminder-execution-repository.port';
import { ReminderExecutionStatus } from '../../reminders/domain/reminder-execution';
import {
  EMAIL_PROVIDER_ADAPTER,
  type IEmailProviderAdapter,
} from '../application/email-provider-adapter.port';
import type {
  AuthEmailJob,
  ReminderEmailJob,
} from '../application/email-queue.port';
import { EMAIL_QUEUE } from './email-queue.constants';

@Injectable()
@Processor(EMAIL_QUEUE)
export class EmailQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailQueueProcessor.name);

  constructor(
    @Inject(EMAIL_PROVIDER_ADAPTER)
    private readonly emailProvider: IEmailProviderAdapter,
    @Inject(REMINDER_EXECUTION_REPOSITORY)
    private readonly executionRepo: IReminderExecutionRepository,
    private readonly tenantContext: TenantContextService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'send-auth-email') {
      return this.processAuthEmail(job as Job<AuthEmailJob>);
    }
    return this.processReminderEmail(job as Job<ReminderEmailJob>);
  }

  private async processAuthEmail(job: Job<AuthEmailJob>): Promise<void> {
    const { to, subject, html, emailType } = job.data;
    try {
      await this.emailProvider.send(to, subject, html, { emailType });
    } catch (error) {
      this.logger.error({
        message: 'Auth email send failed',
        emailType,
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async processReminderEmail(
    job: Job<ReminderEmailJob>,
  ): Promise<void> {
    const {
      reminderExecutionId,
      receivableId,
      organizationId,
      to,
      replyTo,
      subject,
      html,
    } = job.data;

    await this.tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      async () => {
        const status = await this.executionRepo.getStatus(reminderExecutionId);
        if (status !== ReminderExecutionStatus.PENDING) {
          this.logger.warn(
            `Skipping email send for ${reminderExecutionId}: status is already ${status ?? 'unknown'}`,
          );
          return;
        }

        const result = await this.emailProvider.send(
          to,
          subject,
          html,
          { reminderExecutionId },
          replyTo,
        );
        await this.executionRepo.updateSendResult(
          reminderExecutionId,
          'SENT',
          result.providerMessageId,
        );
        this.eventEmitter.emit('reminder.sent', {
          reminderExecutionId,
          receivableId,
          organizationId,
        });
      },
    );
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return;

    if (job.name === 'send-auth-email') {
      this.logger.error(
        `Auth email job ${job.id ?? 'unknown'} failed permanently after ${job.attemptsMade} attempts`,
      );
      return;
    }

    const data = job.data as ReminderEmailJob;
    const { reminderExecutionId, receivableId, organizationId } = data;
    await this.tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      async () => {
        await this.executionRepo.updateSendResult(
          reminderExecutionId,
          'FAILED',
          null,
        );
        this.eventEmitter.emit('reminder.failed', {
          reminderExecutionId,
          receivableId,
          organizationId,
        });
      },
    );
    this.logger.error(
      `Email job ${job.id ?? 'unknown'} failed permanently after ${job.attemptsMade} attempts`,
    );
  }
}
