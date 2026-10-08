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
  emailService: Pick<IEmailService, 'sendReminderEmail'> &
    Partial<Pick<IEmailService, 'recoverReminderDelivery'>>;
  executionRepo: IReminderExecutionRepository;
}) {
  const emailService: IEmailService = {
    recoverReminderDelivery: jest.fn().mockResolvedValue('MISSING'),
    ...deps.emailService,
  };
  return new ReminderSenderService(
    {
      findByReceivableId: jest.fn().mockResolvedValue(deps.candidate),
    } as unknown as IReminderCandidateReader,
    {
      findById: jest.fn().mockResolvedValue(rule),
    } as unknown as IReminderRuleRepository,
    deps.executionRepo,
    emailService,
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
    const emailService = {
      sendReminderEmail: jest.fn(),
      recoverReminderDelivery: jest.fn(),
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
      minIntervalDays: 11,
    });

    expect(executionRepo.insertIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING', minIntervalDays: 11 }),
    );
    expect(emailService.sendReminderEmail).toHaveBeenCalledWith({
      receivableId: 'rec-1',
      templateId: 'template-1',
      reminderExecutionId: expect.any(String),
      minIntervalDays: 11,
    });
  });

  it('does not touch a terminal execution that already exists', async () => {
    const candidate = {
      receivableId: 'rec-1',
      status: ReceivableStatus.OPEN,
      isDisputed: false,
    };
    const emailService = {
      sendReminderEmail: jest.fn(),
      recoverReminderDelivery: jest.fn(),
    };
    const executionRepo = {
      findByKey: jest
        .fn()
        .mockResolvedValue({ id: 'exec-existing', status: 'SENT' }),
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
    expect(emailService.recoverReminderDelivery).not.toHaveBeenCalled();
    expect(executionRepo.save).not.toHaveBeenCalled();
  });

  it('resumes an existing pending execution with its original ID when queue jobs are absent', async () => {
    const candidate = {
      receivableId: 'rec-1',
      status: ReceivableStatus.OPEN,
      isDisputed: false,
    };
    const emailService = {
      sendReminderEmail: jest.fn().mockResolvedValue(undefined),
      recoverReminderDelivery: jest.fn().mockResolvedValue('MISSING'),
    };
    const executionRepo = {
      findByKey: jest.fn().mockResolvedValue({
        id: 'exec-existing',
        status: 'PENDING',
        minIntervalDays: 13,
      }),
      insertIfAbsent: jest.fn(),
      save: jest.fn(),
    } as any;
    const service = createSender({ candidate, emailService, executionRepo });

    await service.send({
      organizationId: 'org-1',
      receivableId: 'rec-1',
      reminderRuleId: 'rule-1',
      executionDate: '2026-08-03',
    });

    expect(emailService.recoverReminderDelivery).toHaveBeenCalledWith(
      'exec-existing',
    );
    expect(executionRepo.insertIfAbsent).not.toHaveBeenCalled();
    expect(emailService.sendReminderEmail).toHaveBeenCalledWith({
      receivableId: 'rec-1',
      templateId: 'template-1',
      reminderExecutionId: 'exec-existing',
      minIntervalDays: 13,
    });
  });

  it('leaves an existing execution alone while its email job is in flight', async () => {
    const emailService = {
      sendReminderEmail: jest.fn(),
      recoverReminderDelivery: jest.fn().mockResolvedValue('IN_FLIGHT'),
    };
    const executionRepo = {
      findByKey: jest
        .fn()
        .mockResolvedValue({ id: 'exec-existing', status: 'PENDING' }),
      updateSendResult: jest.fn(),
      markSkippedIfPending: jest.fn(),
      insertIfAbsent: jest.fn(),
      save: jest.fn(),
    } as any;
    const service = createSender({
      candidate: null,
      emailService,
      executionRepo,
    });

    await service.send({
      organizationId: 'org-1',
      receivableId: 'rec-1',
      reminderRuleId: 'rule-1',
      executionDate: '2026-08-03',
    });

    expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
    expect(executionRepo.updateSendResult).not.toHaveBeenCalled();
    expect(executionRepo.markSkippedIfPending).not.toHaveBeenCalled();
  });

  it.each([
    ['COMPLETED', 'outcome is unknown'],
    ['EXHAUSTED', 'configured retries'],
  ] as const)(
    'marks the same execution FAILED when queue recovery returns %s',
    async (recovery, reason) => {
      const emailService = {
        sendReminderEmail: jest.fn(),
        recoverReminderDelivery: jest.fn().mockResolvedValue(recovery),
      };
      const executionRepo = {
        findByKey: jest
          .fn()
          .mockResolvedValue({ id: 'exec-existing', status: 'PENDING' }),
        updateSendResult: jest.fn(),
        markSkippedIfPending: jest.fn(),
        insertIfAbsent: jest.fn(),
        save: jest.fn(),
      } as any;
      const service = createSender({
        candidate: null,
        emailService,
        executionRepo,
      });

      await service.send({
        organizationId: 'org-1',
        receivableId: 'rec-1',
        reminderRuleId: 'rule-1',
        executionDate: '2026-08-03',
      });

      expect(executionRepo.updateSendResult).toHaveBeenCalledWith(
        'exec-existing',
        'FAILED',
        null,
        expect.stringContaining(reason),
      );
      expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      {
        receivableId: 'rec-1',
        status: ReceivableStatus.PAID,
        isDisputed: false,
      },
      'ALREADY_PAID',
    ],
    [
      {
        receivableId: 'rec-1',
        status: ReceivableStatus.OPEN,
        isDisputed: true,
      },
      'DISPUTED',
    ],
  ] as const)(
    'marks the same pending execution SKIPPED when current eligibility changes',
    async (candidate, skipReason) => {
      const emailService = {
        sendReminderEmail: jest.fn(),
        recoverReminderDelivery: jest.fn().mockResolvedValue('MISSING'),
      };
      const executionRepo = {
        findByKey: jest
          .fn()
          .mockResolvedValue({ id: 'exec-existing', status: 'PENDING' }),
        updateSendResult: jest.fn(),
        markSkippedIfPending: jest.fn(),
        insertIfAbsent: jest.fn(),
        save: jest.fn(),
      } as any;
      const service = createSender({ candidate, emailService, executionRepo });

      await service.send({
        organizationId: 'org-1',
        receivableId: 'rec-1',
        reminderRuleId: 'rule-1',
        executionDate: '2026-08-03',
      });

      expect(executionRepo.markSkippedIfPending).toHaveBeenCalledWith(
        'exec-existing',
        skipReason,
      );
      expect(executionRepo.save).not.toHaveBeenCalled();
      expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
    },
  );

  it('marks the pending execution FAILED when its rule was deleted', async () => {
    const emailService = {
      sendReminderEmail: jest.fn(),
      recoverReminderDelivery: jest.fn().mockResolvedValue('MISSING'),
    };
    const executionRepo = {
      findByKey: jest
        .fn()
        .mockResolvedValue({ id: 'exec-existing', status: 'PENDING' }),
      updateSendResult: jest.fn(),
      markSkippedIfPending: jest.fn(),
      insertIfAbsent: jest.fn(),
      save: jest.fn(),
    } as any;
    const service = new ReminderSenderService(
      {
        findByReceivableId: jest.fn().mockResolvedValue({
          receivableId: 'rec-1',
          status: ReceivableStatus.OPEN,
          isDisputed: false,
        }),
      } as unknown as IReminderCandidateReader,
      { findById: jest.fn().mockResolvedValue(null) } as any,
      executionRepo,
      emailService as unknown as IEmailService,
      {
        run: async (_user: unknown, cb: () => Promise<void>) => await cb(),
      } as any,
    );

    await service.send({
      organizationId: 'org-1',
      receivableId: 'rec-1',
      reminderRuleId: 'rule-deleted',
      executionDate: '2026-08-03',
    });

    expect(executionRepo.updateSendResult).toHaveBeenCalledWith(
      'exec-existing',
      'FAILED',
      null,
      expect.stringContaining('rule-deleted'),
    );
    expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
  });

  it('marks the pending execution FAILED when its email template was deleted', async () => {
    const emailService = {
      recoverReminderDelivery: jest.fn().mockResolvedValue('MISSING'),
      sendReminderEmail: jest
        .fn()
        .mockRejectedValue(
          new AppError(ErrorCode.NOT_FOUND, 'template deleted'),
        ),
    };
    const executionRepo = {
      findByKey: jest
        .fn()
        .mockResolvedValue({ id: 'exec-existing', status: 'PENDING' }),
      updateSendResult: jest.fn(),
      markSkippedIfPending: jest.fn(),
      insertIfAbsent: jest.fn(),
      save: jest.fn(),
    } as any;
    const service = createSender({
      candidate: {
        receivableId: 'rec-1',
        status: ReceivableStatus.OPEN,
        isDisputed: false,
      },
      emailService,
      executionRepo,
    });

    await service.send({
      organizationId: 'org-1',
      receivableId: 'rec-1',
      reminderRuleId: 'rule-1',
      executionDate: '2026-08-03',
    });

    expect(executionRepo.updateSendResult).toHaveBeenCalledWith(
      'exec-existing',
      'FAILED',
      null,
      expect.stringContaining('template deleted'),
    );
  });

  it('reuses the execution ID on the next attempt after enqueue failure', async () => {
    let insertedExecutionId: string | undefined;
    const emailService = {
      recoverReminderDelivery: jest.fn().mockResolvedValue('MISSING'),
      sendReminderEmail: jest
        .fn()
        .mockRejectedValueOnce(new Error('enqueue failed'))
        .mockResolvedValueOnce(undefined),
    };
    const executionRepo = {
      findByKey: jest
        .fn()
        .mockImplementation(() =>
          insertedExecutionId
            ? { id: insertedExecutionId, status: 'PENDING' }
            : null,
        ),
      insertIfAbsent: jest.fn().mockImplementation((execution) => {
        insertedExecutionId = execution.id;
        return true;
      }),
      save: jest.fn(),
    } as any;
    const service = createSender({
      candidate: {
        receivableId: 'rec-1',
        status: ReceivableStatus.OPEN,
        isDisputed: false,
      },
      emailService,
      executionRepo,
    });
    const job = {
      organizationId: 'org-1',
      receivableId: 'rec-1',
      reminderRuleId: 'rule-1',
      executionDate: '2026-08-03',
    };

    await expect(service.send(job)).rejects.toThrow('enqueue failed');
    await service.send(job);

    expect(insertedExecutionId).toBeDefined();
    expect(emailService.sendReminderEmail).toHaveBeenNthCalledWith(1, {
      receivableId: 'rec-1',
      templateId: 'template-1',
      reminderExecutionId: insertedExecutionId,
      minIntervalDays: 7,
    });
    expect(emailService.sendReminderEmail).toHaveBeenNthCalledWith(2, {
      receivableId: 'rec-1',
      templateId: 'template-1',
      reminderExecutionId: insertedExecutionId,
      minIntervalDays: 7,
    });
    expect(executionRepo.insertIfAbsent).toHaveBeenCalledTimes(1);
  });

  it('recovers the pending execution inserted by a concurrent sender', async () => {
    const emailService = {
      recoverReminderDelivery: jest.fn().mockResolvedValue('MISSING'),
      sendReminderEmail: jest.fn().mockResolvedValue(undefined),
    };
    const executionRepo = {
      findByKey: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'winner-exec', status: 'PENDING' }),
      insertIfAbsent: jest.fn().mockResolvedValue(false),
      save: jest.fn(),
    } as any;
    const service = createSender({
      candidate: {
        receivableId: 'rec-1',
        status: ReceivableStatus.OPEN,
        isDisputed: false,
      },
      emailService,
      executionRepo,
    });

    await service.send({
      organizationId: 'org-1',
      receivableId: 'rec-1',
      reminderRuleId: 'rule-1',
      executionDate: '2026-08-03',
    });

    expect(emailService.recoverReminderDelivery).toHaveBeenCalledWith(
      'winner-exec',
    );
    expect(emailService.sendReminderEmail).toHaveBeenCalledWith({
      receivableId: 'rec-1',
      templateId: 'template-1',
      reminderExecutionId: 'winner-exec',
      minIntervalDays: 7,
    });
  });

  it('records a legacy job as FAILED when its deleted rule interval cannot be recovered', async () => {
    const candidate = {
      receivableId: 'rec-1',
      status: ReceivableStatus.OPEN,
      isDisputed: false,
    };
    const emailService = {
      sendReminderEmail: jest.fn(),
      recoverReminderDelivery: jest.fn(),
    };
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

    await service.send({
      organizationId: 'org-1',
      receivableId: 'rec-1',
      reminderRuleId: 'rule-missing',
      executionDate: '2026-08-03',
    });

    expect(executionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        reminderRuleId: null,
        minIntervalDays: null,
        failureReason: expect.stringContaining(
          'minimum interval configuration',
        ),
      }),
    );
    expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
  });
});
