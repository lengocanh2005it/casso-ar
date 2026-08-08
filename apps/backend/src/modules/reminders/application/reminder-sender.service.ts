import { randomUUID } from 'node:crypto';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Injectable, Logger } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  ReminderExecution,
  ReminderExecutionStatus,
  ReminderSkipReason,
} from '../domain/reminder-execution';
import type { IEmailService } from './i-email-service.port';
import type { IReminderCandidateReader } from './reminder-candidate-reader.port';
import type { IReminderExecutionRepository } from './reminder-execution-repository.port';
import type { IReminderRuleRepository } from './reminder-rule-repository.port';

export interface SendReminderJob {
  organizationId: string;
  receivableId: string;
  reminderRuleId: string;
  executionDate: string;
}

@Injectable()
export class ReminderSenderService {
  private readonly logger = new Logger(ReminderSenderService.name);

  constructor(
    private readonly candidateReader: IReminderCandidateReader,
    private readonly ruleRepo: IReminderRuleRepository,
    private readonly executionRepo: IReminderExecutionRepository,
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
      const execution = new ReminderExecution({
        id: randomUUID(),
        organizationId: job.organizationId,
        receivableId: job.receivableId,
        reminderRuleId: job.reminderRuleId,
        executionDate: new Date(job.executionDate),
        sentAt: null,
        status: ReminderExecutionStatus.SKIPPED,
        skipReason: ReminderSkipReason.ALREADY_PAID,
        providerMessageId: null,
        failureReason: null,
        createdAt: new Date(),
      });
      await this.executionRepo.save(execution);
      return;
    }

    if (candidate.isDisputed) {
      const execution = new ReminderExecution({
        id: randomUUID(),
        organizationId: job.organizationId,
        receivableId: job.receivableId,
        reminderRuleId: job.reminderRuleId,
        executionDate: new Date(job.executionDate),
        sentAt: null,
        status: ReminderExecutionStatus.SKIPPED,
        skipReason: ReminderSkipReason.DISPUTED,
        providerMessageId: null,
        failureReason: null,
        createdAt: new Date(),
      });
      await this.executionRepo.save(execution);
      return;
    }

    const rule = await this.ruleRepo.findById(job.reminderRuleId);
    if (!rule) {
      throw new Error(
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
