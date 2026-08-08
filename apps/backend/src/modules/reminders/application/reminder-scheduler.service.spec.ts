import { ReceivableStatus } from '@casso-ledger/shared-types';
import { CustomerGroup } from '../../customers/domain/customer-group';
import { ReminderPolicy } from '../domain/reminder-policy';
import { ReminderRule } from '../domain/reminder-rule';
import type { ReminderCandidate } from './reminder-candidate-reader.port';
import { ReminderSchedulerService } from './reminder-scheduler.service';

const policy = new ReminderPolicy({
  id: 'policy-vip',
  organizationId: 'org-1',
  customerGroup: CustomerGroup.VIP,
  isActive: true,
  createdAt: new Date('2026-08-01'),
});

const rule = new ReminderRule({
  id: 'rule-5',
  reminderPolicyId: policy.id,
  offsetDays: -5,
  emailTemplateId: 'template-1',
  minIntervalDays: 7,
  createdAt: new Date('2026-08-01'),
});

function makeCandidate(
  overrides: Partial<ReminderCandidate> = {},
): ReminderCandidate {
  return {
    receivableId: 'rec-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    customerGroup: CustomerGroup.VIP,
    customerName: 'Company B',
    customerEmail: 'ap@congtyb.vn',
    invoiceNumber: 'INV-001',
    originalAmount: 50_000_000,
    paidAmount: 0,
    remainingAmount: 50_000_000,
    dueDate: new Date('2026-08-08'),
    status: ReceivableStatus.OPEN,
    isDisputed: false,
    ...overrides,
  };
}

describe('ReminderSchedulerService', () => {
  it('enqueues the exact offset rule for an eligible candidate', async () => {
    const candidate = makeCandidate();
    const queueAdd = jest.fn();
    const scheduler = new ReminderSchedulerService(
      {
        findAllOrganizationIdsForScheduler: jest
          .fn()
          .mockResolvedValue(['org-1']),
        findByCustomerGroup: jest.fn().mockResolvedValue(policy),
      } as any,
      { findByPolicyId: jest.fn().mockResolvedValue([rule]) } as any,
      {
        findLatestSent: jest.fn().mockResolvedValue(null),
        insertIfAbsent: jest.fn().mockResolvedValue(true),
        save: jest.fn(),
      } as any,
      { findOpenCandidates: jest.fn().mockResolvedValue([candidate]) } as any,
      { add: queueAdd } as any,
      {
        run: async (_user: unknown, cb: () => Promise<void>) => await cb(),
      } as any,
      { emitAsync: jest.fn().mockResolvedValue([]) } as any,
    );

    await scheduler.scan(new Date('2026-08-03'));

    expect(queueAdd).toHaveBeenCalledWith(
      'send-reminder',
      expect.objectContaining({
        receivableId: 'rec-1',
        reminderRuleId: 'rule-5',
      }),
      expect.objectContaining({
        jobId: expect.stringContaining('rec-1'),
      }),
    );
    const jobId = queueAdd.mock.calls[0][2].jobId as string;
    expect(jobId).not.toContain(':');
  });

  it('does not enqueue a disputed candidate', async () => {
    const queueAdd = jest.fn();
    const scheduler = new ReminderSchedulerService(
      {
        findAllOrganizationIdsForScheduler: jest
          .fn()
          .mockResolvedValue(['org-1']),
        findByCustomerGroup: jest.fn().mockResolvedValue(policy),
      } as any,
      { findByPolicyId: jest.fn().mockResolvedValue([rule]) } as any,
      {
        findLatestSent: jest.fn().mockResolvedValue(null),
        insertIfAbsent: jest.fn().mockResolvedValue(true),
        save: jest.fn(),
      } as any,
      {
        findOpenCandidates: jest
          .fn()
          .mockResolvedValue([makeCandidate({ isDisputed: true })]),
      } as any,
      { add: queueAdd } as any,
      {
        run: async (_user: unknown, cb: () => Promise<void>) => await cb(),
      } as any,
      { emitAsync: jest.fn().mockResolvedValue([]) } as any,
    );

    await scheduler.scan(new Date('2026-08-03'));
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('emits reminder.scan.completed after organization evaluation', async () => {
    const eventEmitter = { emitAsync: jest.fn().mockResolvedValue([]) };
    const queueAdd = jest.fn();
    const scheduler = new ReminderSchedulerService(
      {
        findAllOrganizationIdsForScheduler: jest
          .fn()
          .mockResolvedValue(['org-1']),
        findByCustomerGroup: jest.fn().mockResolvedValue(policy),
      } as any,
      { findByPolicyId: jest.fn().mockResolvedValue([rule]) } as any,
      {
        findLatestSent: jest.fn().mockResolvedValue(null),
        insertIfAbsent: jest.fn().mockResolvedValue(true),
        save: jest.fn(),
      } as any,
      { findOpenCandidates: jest.fn().mockResolvedValue([]) } as any,
      { add: queueAdd } as any,
      {
        run: async (_user: unknown, cb: () => Promise<void>) => await cb(),
      } as any,
      eventEmitter as any,
    );

    await scheduler.scan(new Date('2026-08-03'));
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
      'reminder.scan.completed',
      {
        organizationId: 'org-1',
        scanDate: expect.any(String),
      },
    );
  });

  it('records RATE_LIMITED when recent SENT execution exists within minIntervalDays', async () => {
    const executionRepo = {
      findLatestSent: jest.fn().mockResolvedValue({
        sentAt: new Date('2026-08-01'),
      }),
      insertIfAbsent: jest.fn().mockResolvedValue(true),
      save: jest.fn(),
    };
    const queueAdd = jest.fn();
    const scheduler = new ReminderSchedulerService(
      {
        findAllOrganizationIdsForScheduler: jest
          .fn()
          .mockResolvedValue(['org-1']),
        findByCustomerGroup: jest.fn().mockResolvedValue(policy),
      } as any,
      { findByPolicyId: jest.fn().mockResolvedValue([rule]) } as any,
      executionRepo as any,
      {
        findOpenCandidates: jest
          .fn()
          .mockResolvedValue([
            makeCandidate({ dueDate: new Date('2026-08-08') }),
          ]),
      } as any,
      { add: queueAdd } as any,
      {
        run: async (_user: unknown, cb: () => Promise<void>) => await cb(),
      } as any,
      { emitAsync: jest.fn().mockResolvedValue([]) } as any,
    );

    await scheduler.scan(new Date('2026-08-03'));

    expect(executionRepo.insertIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'SKIPPED',
        skipReason: 'RATE_LIMITED',
      }),
    );
    expect(queueAdd).not.toHaveBeenCalled();
  });
});
