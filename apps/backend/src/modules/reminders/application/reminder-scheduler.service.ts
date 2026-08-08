import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Queue } from 'bullmq';
import { formatInTimeZone } from 'date-fns-tz';
import type { IEventPublisher } from '../../../common/events/event-publisher.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import {
  ReminderExecutionStatus,
  ReminderSkipReason,
} from '../domain/reminder-execution';
import type { IReminderCandidateReader } from './reminder-candidate-reader.port';
import type { IReminderExecutionRepository } from './reminder-execution-repository.port';
import type { IReminderPolicyRepository } from './reminder-policy-repository.port';
import { findMatchingRule } from './reminder-rule-matcher';
import type { IReminderRuleRepository } from './reminder-rule-repository.port';

export const REMINDER_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const REMINDER_SEND_QUEUE = 'reminder-send';

export interface ReminderSendJob {
  organizationId: string;
  receivableId: string;
  reminderRuleId: string;
  executionDate: string;
}

function calendarDate(date: Date): string {
  return formatInTimeZone(date, REMINDER_TIMEZONE, 'yyyy-MM-dd');
}

function calculateOffsetDays(dueDate: Date, today: Date): number {
  const due = new Date(calendarDate(dueDate));
  const now = new Date(calendarDate(today));
  return Math.round((now.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
}

@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);

  constructor(
    private readonly policyRepo: IReminderPolicyRepository,
    private readonly ruleRepo: IReminderRuleRepository,
    private readonly executionRepo: IReminderExecutionRepository,
    private readonly candidateReader: IReminderCandidateReader,
    @Inject(REMINDER_SEND_QUEUE)
    private readonly sendQueue: Queue<ReminderSendJob>,
    private readonly tenantContext: TenantContextService,
    private readonly eventEmitter: IEventPublisher,
  ) {}

  @Cron('0 1 * * *', { timeZone: REMINDER_TIMEZONE })
  async scan(today: Date = new Date()): Promise<void> {
    const orgIds = await this.policyRepo.findAllOrganizationIdsForScheduler();

    for (const orgId of orgIds) {
      try {
        await this.tenantContext.run(
          { userId: 'system', organizationId: orgId, role: Role.OWNER },
          () => this.scanOrganization(orgId, today),
        );
      } catch (error) {
        this.logger.error({
          message: 'Failed to scan organization for reminders',
          organizationId: orgId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async scanOrganization(
    organizationId: string,
    today: Date,
  ): Promise<void> {
    const candidates = await this.candidateReader.findOpenCandidates();
    const executionDate = calendarDate(today);

    for (const candidate of candidates) {
      if (candidate.isDisputed) continue;

      const policy = await this.policyRepo.findByCustomerGroup(
        candidate.customerGroup,
      );
      if (!policy || !policy.isActive) continue;

      const rules = await this.ruleRepo.findByPolicyId(policy.id);
      const offsetDays = calculateOffsetDays(candidate.dueDate, today);
      const matchingRule = findMatchingRule(rules, offsetDays);
      if (!matchingRule) continue;

      const latestSent = await this.executionRepo.findLatestSent(
        candidate.receivableId,
      );
      if (latestSent) {
        const daysSinceLastSend = Math.round(
          (today.getTime() - latestSent.sentAt.getTime()) /
            (24 * 60 * 60 * 1000),
        );
        if (daysSinceLastSend < matchingRule.minIntervalDays) {
          await this.executionRepo.insertIfAbsent({
            id: randomUUID(),
            organizationId,
            receivableId: candidate.receivableId,
            reminderRuleId: matchingRule.id,
            executionDate: new Date(executionDate),
            sentAt: null,
            status: ReminderExecutionStatus.SKIPPED,
            skipReason: ReminderSkipReason.RATE_LIMITED,
            providerMessageId: null,
            failureReason: null,
            createdAt: new Date(),
          });
          continue;
        }
      }

      await this.sendQueue.add(
        'send-reminder',
        {
          organizationId,
          receivableId: candidate.receivableId,
          reminderRuleId: matchingRule.id,
          executionDate,
        },
        {
          jobId: `reminder:${candidate.receivableId}:${matchingRule.id}:${executionDate}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
    }

    await this.eventEmitter.emitAsync('reminder.scan.completed', {
      organizationId,
      scanDate: executionDate,
    });
  }
}
