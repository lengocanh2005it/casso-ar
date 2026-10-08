import { randomUUID } from 'node:crypto';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Job } from 'bullmq';
import { buildCassoEmail } from '../../../common/email/casso-email-template';
import type { EmailAttachment } from '../../../common/email/email-attachment';
import { MetricsService } from '../../../common/observability/metrics.service';
import { RequestIdStore } from '../../../common/observability/request-id.store';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { REMINDER_EXECUTION_REPOSITORY } from '../../../common/tokens/reminder-execution.token';
import {
  ATTACHMENT_STORAGE,
  type IAttachmentStorage,
} from '../../email-templates/application/attachment-storage.port';
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
  type EmailAttachmentRef,
  type IEmailQueue,
  type OwnerAlertEmailJob,
  type ReminderEmailJob,
} from '../application/email-queue.port';
import { SMTP_CONFIG_FAILED } from '../application/smtp-config-failed.event';
import { EMAIL_QUEUE } from './email-queue.constants';

const REMINDER_FAILURE_LOCK_WAIT_MS = 30_000;

interface ReminderFailureOutcome {
  isCurrent: boolean;
  transitionedSmtpConfigId?: string;
}

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
    @Inject(ATTACHMENT_STORAGE)
    private readonly attachmentStorage: IAttachmentStorage,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    return this.requestIdStore.run(getJobRequestId(job), () => {
      if (job.name === 'send-auth-email') {
        return this.processAuthEmail(job as Job<AuthEmailJob>);
      }
      if (job.name === 'send-owner-alert') {
        return this.processOwnerAlertEmail(job as Job<OwnerAlertEmailJob>);
      }
      return this.processReminderEmail(job as Job<ReminderEmailJob>);
    });
  }

  // Owner alerts (e.g. bank connection lost ACTIVE) always go through Resend:
  // the org's own SMTP may be exactly what's failing, and this alert must not
  // depend on it.
  private async processOwnerAlertEmail(
    job: Job<OwnerAlertEmailJob>,
  ): Promise<void> {
    const { organizationId, to, subject, html, text, attachments } = job.data;
    await this.tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      async () => {
        const resendAdapter = await this.resolver.resolve(
          organizationId,
          'RESEND',
        );
        await resendAdapter.send(
          to,
          subject,
          html,
          { emailType: 'OWNER_ALERT' },
          undefined,
          undefined,
          text !== undefined || attachments !== undefined
            ? { text, attachments }
            : undefined,
        );
      },
    );
  }

  private async processAuthEmail(job: Job<AuthEmailJob>): Promise<void> {
    const { to, subject, html, text, attachments, emailType } = job.data;
    const resendAdapter = await this.resolver.resolve('__auth__', 'RESEND');
    try {
      await resendAdapter.send(
        to,
        subject,
        html,
        { emailType },
        undefined,
        undefined,
        text !== undefined || attachments !== undefined
          ? { text, attachments }
          : undefined,
      );
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
      fromName,
      attachmentRefs,
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

        const attachments = await this.buildEmailAttachments(
          attachmentRefs,
          html,
        );

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
          fromName,
          attachments ? { attachments } : undefined,
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

  private async buildEmailAttachments(
    refs: EmailAttachmentRef[] | undefined,
    html: string,
  ): Promise<EmailAttachment[] | undefined> {
    if (!refs || refs.length === 0) return undefined;

    const attachments: EmailAttachment[] = [];
    for (const ref of refs) {
      const stillExists = await this.attachmentStorage.exists(ref.storageKey);
      if (!stillExists) {
        this.logger.warn({
          message: 'Skipping reminder attachment that no longer exists on disk',
          storageKey: ref.storageKey,
          filename: ref.filename,
        });
        continue;
      }
      const buffer = await this.attachmentStorage.read(ref.storageKey);
      const isInline = html.includes(`cid:${ref.filename}`);
      attachments.push({
        filename: ref.filename,
        content: buffer.toString('base64'),
        contentType: ref.mimeType,
        ...(isInline ? { contentId: ref.filename } : {}),
      });
    }
    return attachments.length > 0 ? attachments : undefined;
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

      if (job.name === 'send-owner-alert') {
        const alertData = job.data as OwnerAlertEmailJob;
        this.logger.error({
          message: `Owner alert job ${job.id ?? 'unknown'} failed permanently after ${job.attemptsMade} attempts`,
          organizationId: alertData.organizationId,
          userId: 'system',
          requestId: getJobRequestId(job),
        });
        return;
      }

      const data = job.data as ReminderEmailJob;
      const { reminderExecutionId, organizationId } = data;

      const lock = await this.emailQueue.runWithReminderDeliveryLock(
        reminderExecutionId,
        () => this.handleFinalReminderFailure(job, data),
        REMINDER_FAILURE_LOCK_WAIT_MS,
      );
      if (!lock.acquired) {
        this.logger.warn({
          message:
            'Reminder failure handler could not acquire the execution recovery lock; the next sweep will retry',
          organizationId,
          userId: 'system',
          requestId: getJobRequestId(job),
          reminderExecutionId,
        });
        return;
      }
      if (!lock.value.isCurrent) return;
      if (lock.leaseLost) {
        this.logger.warn({
          message:
            'Reminder failure handler lost its recovery lock lease after completing guarded side effects',
          organizationId,
          userId: 'system',
          requestId: getJobRequestId(job),
          reminderExecutionId,
        });
      }

      if (lock.value.transitionedSmtpConfigId) {
        await this.sendSmtpFailureWarning(job, organizationId);
        this.eventEmitter.emit(SMTP_CONFIG_FAILED, {
          organizationId,
          smtpConfigId: lock.value.transitionedSmtpConfigId,
        });
      }
    });
  }

  private async handleFinalReminderFailure(
    job: Job,
    data: ReminderEmailJob,
  ): Promise<ReminderFailureOutcome> {
    const reminderExecutionId = data.reminderExecutionId;
    const organizationId = data.organizationId;
    const jobId = job.id ?? reminderExecutionId;
    const isCurrent = await this.emailQueue.isReminderJobFailureCurrent(
      jobId,
      job.attemptsMade,
    );
    if (!isCurrent) return { isCurrent: false };

    if (data.forceProvider === 'RESEND') {
      await this.markExecutionFailed(reminderExecutionId, organizationId);
      return { isCurrent: true };
    }

    return this.tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      async () => {
        const config =
          await this.smtpConfigRepo.findByOrganizationId(organizationId);
        if (!config?.isConnected()) {
          await this.markExecutionFailed(reminderExecutionId, organizationId);
          return { isCurrent: true };
        }

        // `transitioned` guards the one-time warning; every reminder still
        // receives the stable Resend fallback job even when another execution
        // already failed the organization SMTP config.
        const transitioned =
          await this.smtpConfigRepo.markFailedIfVersionMatches(
            config.markFailed(),
          );
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
        return {
          isCurrent: true,
          ...(transitioned ? { transitionedSmtpConfigId: config.id } : {}),
        };
      },
    );
  }

  private async sendSmtpFailureWarning(
    job: Job,
    organizationId: string,
  ): Promise<void> {
    const ownerMembership =
      await this.membershipRepo.findOwnerByOrganization(organizationId);
    const owner = ownerMembership
      ? await this.userRepo.findById(ownerMembership.userId)
      : null;
    if (!owner?.email) return;

    try {
      const warningAdapter = await this.resolver.resolve(
        organizationId,
        'RESEND',
      );
      const warning = buildCassoEmail({
        title: 'Thông báo về máy chủ email riêng',
        greeting: 'Kính chào Quý khách,',
        paragraphs: [
          'Casso không thể gửi email nhắc nợ qua máy chủ email riêng của bạn. Các email nhắc nợ tạm thời sẽ được gửi qua Casso cho đến khi bạn cấu hình lại.',
        ],
      });
      await warningAdapter.send(
        owner.email,
        'Email server riêng của bạn đang gặp sự cố',
        warning.html,
        { emailType: 'SMTP_CONNECTION_FAILED_WARNING' },
        undefined,
        undefined,
        { text: warning.text, attachments: warning.attachments },
      );
    } catch (error) {
      this.logger.error({
        message: 'SMTP failure warning email could not be sent',
        organizationId,
        userId: 'system',
        requestId: getJobRequestId(job),
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
