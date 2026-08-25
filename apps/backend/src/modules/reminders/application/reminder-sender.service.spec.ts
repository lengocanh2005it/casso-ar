import { ReceivableStatus } from '@casso-ar/shared-types';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { TenantContextService } from '../../../common/tenancy/tenant-context';
import { ReminderRule } from '../domain/reminder-rule';
import type { IEmailService } from './i-email-service.port';
import type { IReminderCandidateReader } from './reminder-candidate-reader.port';
import type { IReminderExecutionRepository } from './reminder-execution-repository.port';
import type { IReminderRuleRepository } from './reminder-rule-repository.port';
import { ReminderSenderService } from './reminder-sender.service';

const rule = new ReminderRule({
  id: 'rule-1',
  reminderPolicyId: 'policy-1',
  offsetDays: -5,
  emailTemplateId: 'template-1',
  minIntervalDays: 7,
  createdAt: new Date('2026-08-01'),
});

function createSender(deps: {
  candidate: any;
  emailService: Pick<IEmailService, 'sendReminderEmail'>;
  executionRepo: IReminderExecutionRepository;
}) {
  return new ReminderSenderService(
    {
      findByReceivableId: jest.fn().mockResolvedValue(deps.candidate),
    } as unknown as IReminderCandidateReader,
    {
      findById: jest.fn().mockResolvedValue(rule),
    } as unknown as IReminderRuleRepository,
    deps.executionRepo,
    deps.emailService,
    {
      run: async (_user: unknown, cb: () => Promise<void>) => await cb(),
    } as unknown as TenantContextService,
  );
}

describe('ReminderSenderService', () => {
  it('skips without calling EmailService when receivable was paid', async () => {
    const candidate = {
      receivableId: 'rec-1',
      status: ReceivableStatus.PAID,
      isDisputed: false,
    };
    const emailService = { sendReminderEmail: jest.fn() };
    const executionRepo = {
      findByKey: jest.fn().mockResolvedValue(null),
      insertIfAbsent: jest.fn().mockResolvedValue(true),
      save: jest.fn(),
    } as any;
    const service = createSender({ candidate, emailService, executionRepo });

    await service.send({
      organizationId: 'org-1',
      receivableId: 'rec-1',
      reminderRuleId: 'rule-1',
      executionDate: '2026-08-03',
    });

    expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
    expect(executionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'SKIPPED',
        skipReason: 'ALREADY_PAID',
      }),
    );
  });

  it('skips when an open dispute appears', async () => {
    const candidate = {
      receivableId: 'rec-1',
      status: ReceivableStatus.OPEN,
      isDisputed: true,
    };
    const emailService = { sendReminderEmail: jest.fn() };
    const executionRepo = {
      findByKey: jest.fn().mockResolvedValue(null),
      insertIfAbsent: jest.fn().mockResolvedValue(true),
      save: jest.fn(),
    } as any;
    const service = createSender({ candidate, emailService, executionRepo });

    await service.send({
      organizationId: 'org-1',
      receivableId: 'rec-1',
      reminderRuleId: 'rule-1',
      executionDate: '2026-08-03',
    });

    expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
    expect(executionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SKIPPED', skipReason: 'DISPUTED' }),
    );
  });

  it('creates PENDING execution and calls EmailService for eligible candidate', async () => {
    const candidate = {
      receivableId: 'rec-1',
      status: ReceivableStatus.OPEN,
      isDisputed: false,
    };
    const emailService = {
      sendReminderEmail: jest.fn().mockResolvedValue(undefined),
    };
    const executionRepo = {
      findByKey: jest.fn().mockResolvedValue(null),
      insertIfAbsent: jest.fn().mockResolvedValue(true),
      save: jest.fn(),
    } as any;
    const service = createSender({ candidate, emailService, executionRepo });

    await service.send({
      organizationId: 'org-1',
      receivableId: 'rec-1',
      reminderRuleId: 'rule-1',
      executionDate: '2026-08-03',
    });

    expect(executionRepo.insertIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING' }),
    );
    expect(emailService.sendReminderEmail).toHaveBeenCalledWith({
      receivableId: 'rec-1',
      templateId: 'template-1',
      reminderExecutionId: expect.any(String),
    });
  });

  it('does not re-dispatch when execution already exists', async () => {
    const candidate = {
      receivableId: 'rec-1',
      status: ReceivableStatus.OPEN,
      isDisputed: false,
    };
    const emailService = { sendReminderEmail: jest.fn() };
    const executionRepo = {
      findByKey: jest
        .fn()
        .mockResolvedValue({ id: 'exec-existing', status: 'PENDING' }),
      insertIfAbsent: jest.fn().mockResolvedValue(false),
      save: jest.fn(),
    } as any;
    const service = createSender({ candidate, emailService, executionRepo });

    await service.send({
      organizationId: 'org-1',
      receivableId: 'rec-1',
      reminderRuleId: 'rule-1',
      executionDate: '2026-08-03',
    });

    expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
    expect(executionRepo.save).not.toHaveBeenCalled();
  });

  it('throws a NOT_FOUND AppError when the reminder rule no longer exists', async () => {
    const candidate = {
      receivableId: 'rec-1',
      status: ReceivableStatus.OPEN,
      isDisputed: false,
    };
    const emailService = { sendReminderEmail: jest.fn() };
    const executionRepo = {
      findByKey: jest.fn().mockResolvedValue(null),
      insertIfAbsent: jest.fn(),
      save: jest.fn(),
    } as any;
    const service = new ReminderSenderService(
      {
        findByReceivableId: jest.fn().mockResolvedValue(candidate),
      } as unknown as IReminderCandidateReader,
      {
        findById: jest.fn().mockResolvedValue(null),
      } as unknown as IReminderRuleRepository,
      executionRepo,
      emailService,
      {
        run: async (_user: unknown, cb: () => Promise<void>) => await cb(),
      } as unknown as TenantContextService,
    );

    await expect(
      service.send({
        organizationId: 'org-1',
        receivableId: 'rec-1',
        reminderRuleId: 'rule-missing',
        executionDate: '2026-08-03',
      }),
    ).rejects.toMatchObject(
      new AppError(
        ErrorCode.NOT_FOUND,
        'Reminder rule rule-missing not found — configuration error',
      ),
    );
    expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
  });
});
