import { randomUUID } from 'node:crypto';
import { ReceivableStatus } from '@casso-ar/shared-types';
import { Inject, Injectable, Logger } from '@nestjs/common';
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
import type { IReminderCandidateReader } from './reminder-candidate-reader.port';
import type { IReminderExecutionRepository } from './reminder-execution-repository.port';
import type { IReminderRuleRepository } from './reminder-rule-repository.port';

export interface SendReminderJob {
  organizationId: string;
  receivableId: string;
  reminderRuleId: string;
  executionDate: string;
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
    executionDate: new Date(job.executionDate),
    sentAt: null,
    status: ReminderExecutionStatus.SKIPPED,
    skipReason,
    providerMessageId: null,
    failureReason: null,
    createdAt: new Date(),
  });
}

@Injectable()
export class ReminderSenderService {
  private readonly logger = new Logger(ReminderSenderService.name);

  constructor(
    @Inject('IReminderCandidateReader')
    private readonly candidateReader: IReminderCandidateReader,
    @Inject('IReminderRuleRepository')
    private readonly ruleRepo: IReminderRuleRepository,
    @Inject(REMINDER_EXECUTION_REPOSITORY)
    private readonly executionRepo: IReminderExecutionRepository,
    @Inject(I_EMAIL_SERVICE)
    private readonly emailService: IEmailService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async send(job: SendReminderJob): Promise<void> {
    const existing = await this.executionRepo.findByKey(
      job.receivableId,
      job.reminderRuleId,
      new Date(job.executionDate),
    );
    if (existing) return;

    const candidate = await this.candidateReader.findByReceivableId(
      job.receivableId,
    );

    if (
      !candidate ||
      candidate.status === ReceivableStatus.PAID ||
      candidate.status === ReceivableStatus.WRITTEN_OFF ||
      candidate.status === ReceivableStatus.CANCELLED
    ) {
      await this.executionRepo.save(
        buildSkippedExecution(job, ReminderSkipReason.ALREADY_PAID),
      );
      return;
    }

    if (candidate.isDisputed) {
      await this.executionRepo.save(
        buildSkippedExecution(job, ReminderSkipReason.DISPUTED),
      );
      return;
    }

    const rule = await this.ruleRepo.findById(job.reminderRuleId);
    if (!rule) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        `Reminder rule ${job.reminderRuleId} not found — configuration error`,
      );
    }

    const execution = new ReminderExecution({
      id: randomUUID(),
      organizationId: job.organizationId,
      receivableId: job.receivableId,
      reminderRuleId: job.reminderRuleId,
      executionDate: new Date(job.executionDate),
      sentAt: null,
      status: ReminderExecutionStatus.PENDING,
      skipReason: null,
      providerMessageId: null,
      failureReason: null,
      createdAt: new Date(),
    });

    const claimed = await this.executionRepo.insertIfAbsent(execution);
    if (!claimed) return;

    await this.emailService.sendReminderEmail({
      receivableId: job.receivableId,
      templateId: rule.emailTemplateId,
      reminderExecutionId: execution.id,
    });
  }
}
