import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from '../../customers/application/customer-repository.port';
import type { CustomerGroup } from '../../customers/domain/customer-group';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { Role } from '../../organizations/domain/membership';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import type { IReminderPolicyRepository } from '../../reminders/application/reminder-policy-repository.port';
import { DEFAULT_ESCALATION_THRESHOLD_DAYS } from '../../reminders/domain/reminder-policy';
import { InternalTask } from '../domain/internal-task';
import {
  type IInternalTaskRepository,
  INTERNAL_TASK_REPOSITORY,
} from './internal-task-repository.port';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const OVERDUE_CANDIDATE_FLOOR_DAYS = 1;
const SCAN_BATCH_SIZE = 500;

function daysOverdue(dueDate: Date, today: Date): number {
  return Math.floor((today.getTime() - dueDate.getTime()) / MS_PER_DAY);
}

@Injectable()
export class RunEscalationScanUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    @Inject('IReminderPolicyRepository')
    private readonly reminderPolicyRepo: IReminderPolicyRepository,
    @Inject(INTERNAL_TASK_REPOSITORY)
    private readonly internalTaskRepo: IInternalTaskRepository,
    private readonly tenantContext: TenantContextService,
    private readonly dataSource: DataSource,
  ) {}

  async scanOrganization(organizationId: string): Promise<void> {
    await this.tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      async () => {
        const financeManager = await this.membershipRepo.findFirstByRole(
          organizationId,
          Role.FINANCE_MANAGER,
        );
        const assignee =
          financeManager ??
          (await this.membershipRepo.findOwnerByOrganization(organizationId));
        if (!assignee) return;

        const thresholds = new Map<CustomerGroup, number>();
        const today = new Date();
        let afterId: string | null = null;

        // ponytail: batch-loop over a keyset cursor instead of loading every
        // overdue receivable in the org at once — upgrade to a queue-backed
        // worker if a single org's overdue count ever needs cross-request resumability.
        while (true) {
          const candidates = await this.receivableRepo.findOverdueByThreshold(
            organizationId,
            OVERDUE_CANDIDATE_FLOOR_DAYS,
            afterId,
            SCAN_BATCH_SIZE,
          );
          if (candidates.length === 0) break;

          const customers = await this.customerRepo.findByIds([
            ...new Set(candidates.map((candidate) => candidate.customerId)),
          ]);

          for (const receivable of candidates) {
            const overdueDays = daysOverdue(receivable.dueDate, today);
            const customer = customers.get(receivable.customerId);
            const threshold = customer
              ? await this.resolveEscalationThreshold(
                  customer.customerGroup,
                  thresholds,
                )
              : DEFAULT_ESCALATION_THRESHOLD_DAYS;
            if (overdueDays >= threshold) {
              const task = new InternalTask({
                id: randomUUID(),
                organizationId,
                receivableId: receivable.id,
                assignedToUserId: assignee.userId,
                createdByUserId: null,
                taskType: 'ESCALATION',
                title: `Overdue receivable for ${overdueDays} days requires action`,
                description: null,
                dueDate: null,
                status: 'OPEN',
                createdAt: new Date(),
                resolvedAt: null,
                version: 1,
              });

              await this.dataSource.transaction((manager) =>
                this.internalTaskRepo.createEscalationIfAbsent(task, manager),
              );
            }
          }

          afterId = candidates[candidates.length - 1].id;
          if (candidates.length < SCAN_BATCH_SIZE) break;
        }
      },
    );
  }

  private async resolveEscalationThreshold(
    customerGroup: CustomerGroup,
    thresholds: Map<CustomerGroup, number>,
  ): Promise<number> {
    const cached = thresholds.get(customerGroup);
    if (cached !== undefined) return cached;
    const policy =
      await this.reminderPolicyRepo.findByCustomerGroup(customerGroup);
    const threshold = policy?.isActive
      ? policy.escalationThresholdDays
      : DEFAULT_ESCALATION_THRESHOLD_DAYS;
    thresholds.set(customerGroup, threshold);
    return threshold;
  }
}
