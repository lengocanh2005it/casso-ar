import { randomUUID } from 'node:crypto';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Job } from 'bullmq';
import { MetricsService } from '../../../common/observability/metrics.service';
import { RequestIdStore } from '../../../common/observability/request-id.store';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { REMINDER_EXECUTION_REPOSITORY } from '../../../common/tokens/reminder-execution.token';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { Role } from '../../organizations/domain/membership';
import type { IReminderExecutionRepository } from '../../reminders/application/reminder-execution-repository.port';
import { ReminderExecutionStatus } from '../../reminders/domain/reminder-execution';
import {
  type ISmtpConfigRepository,
  SMTP_CONFIG_REPOSITORY,
} from '../../smtp-config/application/smtp-config-repository.port';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import {
  EMAIL_PROVIDER_RESOLVER,
  type IEmailProviderResolver,
} from '../application/email-provider-resolver.port';
import {
  type AuthEmailJob,
  EMAIL_QUEUE_PORT,
  type IEmailQueue,
  type ReminderEmailJob,
} from '../application/email-queue.port';
import { EMAIL_QUEUE } from './email-queue.constants';

function getJobRequestId(job: Job): string {
  return `bullmq:${job.id ?? randomUUID()}`;
}

@Injectable()
@Processor(EMAIL_QUEUE)
export class EmailQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailQueueProcessor.name);

  constructor(
    @Inject(EMAIL_PROVIDER_RESOLVER)
    private readonly resolver: IEmailProviderResolver,
    @Inject(REMINDER_EXECUTION_REPOSITORY)
    private readonly executionRepo: IReminderExecutionRepository,
    @Inject(SMTP_CONFIG_REPOSITORY)
    private readonly smtpConfigRepo: ISmtpConfigRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly tenantContext: TenantContextService,
    private readonly eventEmitter: EventEmitter2,
    private readonly metrics: MetricsService,
    private readonly requestIdStore: RequestIdStore,
    @Inject(EMAIL_QUEUE_PORT) private readonly emailQueue: IEmailQueue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    return this.requestIdStore.run(getJobRequestId(job), () => {
      if (job.name === 'send-auth-email') {
        return this.processAuthEmail(job as Job<AuthEmailJob>);
      }
      return this.processReminderEmail(job as Job<ReminderEmailJob>);
    });
  }

  private async processAuthEmail(job: Job<AuthEmailJob>): Promise<void> {
    const { to, subject, html, emailType } = job.data;
    const resendAdapter = await this.resolver.resolve('__auth__', 'RESEND');
    try {
      await resendAdapter.send(to, subject, html, { emailType });
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
      organizationId,
      to,
      replyTo,
      subject,
      html,
      forceProvider,
    } = job.data;

    await this.tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      async () => {
        const status = await this.executionRepo.getStatus(reminderExecutionId);
        if (status !== ReminderExecutionStatus.PENDING) {
          this.logger.warn({
            message:
              'Skipping email send because the execution is no longer pending',
            reminderExecutionId,
            status: status ?? 'unknown',
            organizationId,
            userId: 'system',
            requestId: getJobRequestId(job),
          });
          return;
        }

        const adapter = await this.resolver.resolve(
          organizationId,
          forceProvider,
        );
        const result = await adapter.send(
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
        this.eventEmitter.emit('reminder.execution.completed', {
          id: reminderExecutionId,
          status: 'SENT',
          providerMessageId: result.providerMessageId,
          organizationId,
        });
      },
    );
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job): Promise<void> {
    return this.requestIdStore.run(getJobRequestId(job), async () => {
      this.metrics.incrementBullmqJobFailed(EMAIL_QUEUE);
      const maxAttempts = job.opts.attempts ?? 1;
      if (job.attemptsMade < maxAttempts) return;

      if (job.name === 'send-auth-email') {
        this.logger.error(
          `Auth email job ${job.id ?? 'unknown'} failed permanently after ${job.attemptsMade} attempts`,
        );
        return;
      }

      const data = job.data as ReminderEmailJob;
      const { reminderExecutionId, organizationId } = data;

      if (data.forceProvider === 'RESEND') {
        await this.markExecutionFailed(reminderExecutionId, organizationId);
        return;
      }

      await this.tenantContext.run(
        { userId: 'system', organizationId, role: Role.OWNER },
        async () => {
          const config =
            await this.smtpConfigRepo.findByOrganizationId(organizationId);
          if (config?.isConnected()) {
            // `transitioned` is false when another reminder job for the same
            // org already flipped this config CONNECTED -> FAILED (concurrent
            // exhaustion race). Either way THIS reminder must still be
            // rescued via the Resend fallback below — only the one-time
            // warning email is guarded by the transition, so it's sent
            // exactly once regardless of which job wins the race.
            const transitioned =
              await this.smtpConfigRepo.markFailedIfVersionMatches(
                config.markFailed(),
              );

            if (transitioned) {
              const ownerMembership =
                await this.membershipRepo.findOwnerByOrganization(
                  organizationId,
                );
              const owner = ownerMembership
                ? await this.userRepo.findById(ownerMembership.userId)
                : null;
              if (owner?.email) {
                try {
                  const warningAdapter = await this.resolver.resolve(
                    organizationId,
                    'RESEND',
                  );
                  await warningAdapter.send(
                    owner.email,
                    'Email server riêng của bạn đang gặp sự cố',
                    '<p>Casso không thể gửi email nhắc nợ qua SMTP server riêng của bạn. Các email nhắc nợ tạm thời sẽ gửi qua Casso cho đến khi bạn cấu hình lại.</p>',
                    { emailType: 'SMTP_CONNECTION_FAILED_WARNING' },
                  );
                } catch (error) {
                  this.logger.error({
                    message: 'SMTP failure warning email could not be sent',
                    organizationId,
                    userId: 'system',
                    requestId: getJobRequestId(job),
                    error:
                      error instanceof Error ? error.message : String(error),
                  });
                }
              }
            }

            await this.emailQueue.add(
              'send-reminder-email',
              { ...data, forceProvider: 'RESEND' },
              {
                jobId: `${reminderExecutionId}-resend-fallback`,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
              },
            );
            this.logger.warn({
              message: transitioned
                ? 'SMTP config exhausted retries; flipped to FAILED and requeued via Resend'
                : 'SMTP config already FAILED by a concurrent job; requeued this reminder via Resend',
              organizationId,
              userId: 'system',
              requestId: getJobRequestId(job),
              reminderExecutionId,
            });
            return;
          }

          await this.markExecutionFailed(reminderExecutionId, organizationId);
        },
      );
    });
  }

  private async markExecutionFailed(
    reminderExecutionId: string,
    organizationId: string,
  ): Promise<void> {
    await this.tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      async () => {
        await this.executionRepo.updateSendResult(
          reminderExecutionId,
          'FAILED',
          null,
        );
        this.eventEmitter.emit('reminder.execution.completed', {
          id: reminderExecutionId,
          status: 'FAILED',
          providerMessageId: null,
          organizationId,
        });
      },
    );
    this.logger.error({
      message: 'Reminder execution failed permanently',
      reminderExecutionId,
      organizationId,
      userId: 'system',
      requestId: this.requestIdStore.getRequestId(),
    });
  }
}
