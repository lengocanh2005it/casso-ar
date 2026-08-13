import { randomUUID } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Queue } from 'bullmq';
import { formatInTimeZone } from 'date-fns-tz';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../common/events/event-publisher.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { REMINDER_EXECUTION_REPOSITORY } from '../../../common/tokens/reminder-execution.token';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import { Role } from '../../organizations/domain/membership';
import {
  ReminderExecutionStatus,
  ReminderSkipReason,
} from '../domain/reminder-execution';
import type { ReminderRule } from '../domain/reminder-rule';
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

export const REMINDER_SCAN_COMPLETED = 'reminder.scan.completed';

export interface ReminderScanCompletedEvent {
  organizationId: string;
  scanDate: string;
  queuedCount: number;
  skippedCount: number;
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
    @Inject('IReminderPolicyRepository')
    private readonly policyRepo: IReminderPolicyRepository,
    @Inject('IReminderRuleRepository')
    private readonly ruleRepo: IReminderRuleRepository,
    @Inject(REMINDER_EXECUTION_REPOSITORY)
    private readonly executionRepo: IReminderExecutionRepository,
    @Inject('IReminderCandidateReader')
    private readonly candidateReader: IReminderCandidateReader,
    @InjectQueue(REMINDER_SEND_QUEUE)
    private readonly sendQueue: Queue<ReminderSendJob>,
    private readonly tenantContext: TenantContextService,
    @Inject(EVENT_PUBLISHER)
    private readonly eventEmitter: IEventPublisher,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
  ) {}

  @Cron('0 1 * * *', { timeZone: REMINDER_TIMEZONE })
  async scan(today: Date = new Date()): Promise<void> {
    const orgIds = await this.organizationRepo.findAllIds();

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
    const eligible = candidates.filter((candidate) => !candidate.isDisputed);
    let queuedCount = 0;
    let skippedCount = 0;
    const emitScanCompleted = () =>
      this.eventEmitter.emitAsync(REMINDER_SCAN_COMPLETED, {
        organizationId,
        scanDate: executionDate,
        queuedCount,
        skippedCount,
      } satisfies ReminderScanCompletedEvent);
    if (eligible.length === 0) {
      await emitScanCompleted();
      return;
    }

    // Load the org's policies and rules once (at most a handful per org) and
    // batch the latest-sent lookup — the old loop did 3 sequential queries
    // per open receivable (~30k queries/night at 10k receivables).
    const policies = await this.policyRepo.findAll();
    const policyByGroup = new Map(
      policies
        .filter((policy) => policy.isActive)
        .map((policy) => [policy.customerGroup, policy]),
    );
    const rulesByPolicyId = new Map<string, ReminderRule[]>();
    for (const policy of policyByGroup.values()) {
      rulesByPolicyId.set(
        policy.id,
        await this.ruleRepo.findByPolicyId(policy.id),
      );
    }
    const latestSentByReceivable =
      await this.executionRepo.findLatestSentByReceivableIds(
        eligible.map((candidate) => candidate.receivableId),
      );

    for (const candidate of eligible) {
      const policy = policyByGroup.get(candidate.customerGroup);
      if (!policy) continue;

      const rules = rulesByPolicyId.get(policy.id) ?? [];
      const offsetDays = calculateOffsetDays(candidate.dueDate, today);
      const matchingRule = findMatchingRule(rules, offsetDays);
      if (!matchingRule) continue;

      const latestSent = latestSentByReceivable.get(candidate.receivableId);
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
          skippedCount += 1;
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
          jobId: `reminder-${candidate.receivableId}-${matchingRule.id}-${executionDate}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
      queuedCount += 1;
    }

    await emitScanCompleted();
  }
}
