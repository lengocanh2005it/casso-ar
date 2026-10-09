import { randomUUID } from 'node:crypto';
import { ReceivableStatus } from '@casso-ar/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { REMINDER_EXECUTION_REPOSITORY } from '../../../common/tokens/reminder-execution.token';
import {
  ReminderExecution,
  ReminderExecutionStatus,
  ReminderSkipReason,
} from '../domain/reminder-execution';
import type { IEmailService } from './i-email-service.port';
import { I_EMAIL_SERVICE } from './i-email-service.port';
import type {
  IReminderCandidateReader,
  ReminderCandidate,
} from './reminder-candidate-reader.port';
import type { IReminderExecutionRepository } from './reminder-execution-repository.port';
import type { IReminderRuleRepository } from './reminder-rule-repository.port';

export interface SendReminderJob {
  organizationId: string;
  receivableId: string;
  reminderRuleId: string;
  executionDate: string;
  minIntervalDays?: number;
}

function buildSkippedExecution(
  job: SendReminderJob,
  skipReason: ReminderSkipReason,
): ReminderExecution {
  return new ReminderExecution({
    id: randomUUID(),
    organizationId: job.organizationId,
    receivableId: job.receivableId,
    reminderRuleId: job.reminderRuleId,
    minIntervalDays: job.minIntervalDays ?? null,
    executionDate: new Date(job.executionDate),
    sentAt: null,
    status: ReminderExecutionStatus.SKIPPED,
    skipReason,
    providerMessageId: null,
    failureReason: null,
    createdAt: new Date(),
  });
}

function getSkipReason(
  candidate: ReminderCandidate | null,
): ReminderSkipReason | null {
  if (
    !candidate ||
    candidate.status === ReceivableStatus.PAID ||
    candidate.status === ReceivableStatus.WRITTEN_OFF ||
    candidate.status === ReceivableStatus.CANCELLED
  ) {
    return ReminderSkipReason.ALREADY_PAID;
  }
  if (candidate.isDisputed) return ReminderSkipReason.DISPUTED;
  return null;
}

@Injectable()
export class ReminderSenderService {
  constructor(
    @Inject('IReminderCandidateReader')
    private readonly candidateReader: IReminderCandidateReader,
    @Inject('IReminderRuleRepository')
    private readonly ruleRepo: IReminderRuleRepository,
    @Inject(REMINDER_EXECUTION_REPOSITORY)
    private readonly executionRepo: IReminderExecutionRepository,
    @Inject(I_EMAIL_SERVICE)
    private readonly emailService: IEmailService,
    // biome-ignore lint/correctness/noUnusedPrivateClassMembers: injected for consistency with the other reminder application services; this one scopes by job.organizationId instead
    private readonly tenantContext: TenantContextService,
  ) {}

  async send(job: SendReminderJob): Promise<void> {
    const existing = await this.executionRepo.findByKey(
      job.receivableId,
      job.reminderRuleId,
      new Date(job.executionDate),
    );
    if (existing) {
      if (existing.status === ReminderExecutionStatus.PENDING) {
        await this.recoverPendingExecution(
          job,
          existing.id,
          existing.minIntervalDays,
        );
      }
      return;
    }

    const candidate = await this.candidateReader.findByReceivableId(
      job.receivableId,
    );

    const skipReason = getSkipReason(candidate);
    if (skipReason === ReminderSkipReason.ALREADY_PAID) {
      await this.executionRepo.save(buildSkippedExecution(job, skipReason));
      return;
    }

    if (skipReason === ReminderSkipReason.DISPUTED) {
      await this.executionRepo.save(buildSkippedExecution(job, skipReason));
      return;
    }

    const rule = await this.ruleRepo.findById(job.reminderRuleId);
    if (!rule) {
      const now = new Date();
      await this.executionRepo.save(
        new ReminderExecution({
          id: randomUUID(),
          organizationId: job.organizationId,
          receivableId: job.receivableId,
          reminderRuleId: null,
          minIntervalDays: job.minIntervalDays ?? null,
          executionDate: new Date(job.executionDate),
          sentAt: null,
          status: ReminderExecutionStatus.FAILED,
          skipReason: null,
          providerMessageId: null,
          failureReason: `Reminder rule ${job.reminderRuleId} was deleted before delivery; its email template or minimum interval configuration cannot be recovered.`,
          createdAt: now,
        }),
      );
      return;
    }

    const minIntervalDays = job.minIntervalDays ?? rule.minIntervalDays;
    const execution = new ReminderExecution({
      id: randomUUID(),
      organizationId: job.organizationId,
      receivableId: job.receivableId,
      reminderRuleId: job.reminderRuleId,
      minIntervalDays,
      executionDate: new Date(job.executionDate),
      sentAt: null,
      status: ReminderExecutionStatus.PENDING,
      skipReason: null,
      providerMessageId: null,
      failureReason: null,
      createdAt: new Date(),
    });

    const claimed = await this.executionRepo.insertIfAbsent(execution);
    if (!claimed) {
      const winner = await this.executionRepo.findByKey(
        job.receivableId,
        job.reminderRuleId,
        new Date(job.executionDate),
      );
      if (winner?.status === ReminderExecutionStatus.PENDING) {
        await this.recoverPendingExecution(
          job,
          winner.id,
          winner.minIntervalDays,
        );
      }
      return;
    }

    await this.emailService.sendReminderEmail({
      receivableId: job.receivableId,
      templateId: rule.emailTemplateId,
      reminderExecutionId: execution.id,
      minIntervalDays,
    });
  }

  private async recoverPendingExecution(
    job: SendReminderJob,
    executionId: string,
    persistedMinIntervalDays: number | null,
  ): Promise<void> {
    const recovery =
      await this.emailService.recoverReminderDelivery(executionId);
    if (recovery === 'COMPLETED' || recovery === 'EXHAUSTED') {
      const reason =
        recovery === 'COMPLETED'
          ? 'Email delivery completed while the reminder execution remained pending; delivery outcome is unknown.'
          : 'Email delivery exhausted its configured retries during recovery.';
      await this.executionRepo.updateSendResult(
        executionId,
        'FAILED',
        null,
        reason,
      );
      return;
    }
    if (recovery !== 'MISSING') return;

    const candidate = await this.candidateReader.findByReceivableId(
      job.receivableId,
    );
    const skipReason = getSkipReason(candidate);
    if (skipReason) {
      await this.executionRepo.markSkippedIfPending(executionId, skipReason);
      return;
    }

    const rule = await this.ruleRepo.findById(job.reminderRuleId);
    if (!rule) {
      await this.executionRepo.updateSendResult(
        executionId,
        'FAILED',
        null,
        `Reminder rule ${job.reminderRuleId} was deleted before delivery recovery; its email template or minimum interval configuration cannot be recovered.`,
      );
      return;
    }

    const minIntervalDays =
      persistedMinIntervalDays ?? job.minIntervalDays ?? rule.minIntervalDays;
    try {
      await this.emailService.sendReminderEmail({
        receivableId: job.receivableId,
        templateId: rule.emailTemplateId,
        reminderExecutionId: executionId,
        minIntervalDays,
      });
    } catch (error) {
      if (
        error instanceof AppError &&
        error.errorCode === ErrorCode.NOT_FOUND
      ) {
        await this.executionRepo.updateSendResult(
          executionId,
          'FAILED',
          null,
          `Reminder email data is unavailable during recovery: ${error.message}`,
        );
        return;
      }
      throw error;
    }
  }
}
