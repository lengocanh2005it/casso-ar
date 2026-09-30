import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { BalanceHistoryActorType } from '../../receivable-balance-history/domain/balance-history-actor-type';
import { WebhookInbox } from '../domain/webhook-inbox';
import { ProcessWebhookUseCase } from './process-webhook.usecase';

const inbox = new WebhookInbox({
  id: 'wh-1',
  organizationId: 'org-1',
  bankConnectionId: 'conn-1',
  providerTransactionId: 'TX-001',
  rawPayload: {
    error: 0,
    data: {
      id: 'TX-001',
      amount: 30_000_000,
      transactionDateTime: '2026-08-05 00:00:00',
      counterAccountNumber: '0011002233',
      counterAccountName: 'CONG TY B',
      description: 'INV-1',
    },
  },
  receivedAt: new Date(),
  status: 'RECEIVED',
  processedAt: null,
  errorMessage: null,
  retryCount: 0,
});

describe('ProcessWebhookUseCase', () => {
  it('auto-allocates the top candidate at or above ninety', async () => {
    const inboxRepo = {
      findById: jest.fn().mockResolvedValue(inbox),
      save: jest.fn(),
    };
    const transactionRepo = { save: jest.fn(), findById: jest.fn() };
    const engine = {
      scoreCandidates: jest.fn().mockResolvedValue([
        {
          receivableId: 'rec-1',
          customerId: 'cust-1',
          totalScore: 95,
          remainingAmount: 30_000_000,
        },
      ]),
      toMatchingCandidateEntities: jest.fn(),
    };
    const paymentRepo = { save: jest.fn(), findByIdForUpdate: jest.fn() };
    const allocation = {
      allocateWithinTransaction: jest
        .fn()
        .mockResolvedValue({ customerId: 'cust-1', becameClosed: true }),
      emitAllocationEvents: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => {
          const result = await callback({});
          expect(allocation.emitAllocationEvents).not.toHaveBeenCalled();
          return result;
        },
      ),
    };
    const tenant = {
      run: jest.fn((_user: unknown, callback: () => Promise<void>) =>
        callback(),
      ),
    };
    const useCase = new ProcessWebhookUseCase(
      inboxRepo as any,
      transactionRepo as any,
      engine as any,
      { saveMany: jest.fn() } as any,
      paymentRepo as any,
      allocation as any,
      dataSource as any,
      tenant as any,
      { record: jest.fn() } as any,
      { evaluate: jest.fn() } as any,
    );

    await useCase.execute('wh-1', 'org-1');

    expect(allocation.allocateWithinTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        receivableId: 'rec-1',
        amount: 30_000_000,
        allocatedByUserId: null,
        provenance: {
          actorType: BalanceHistoryActorType.WEBHOOK,
          actorUserId: null,
        },
      }),
    );
    expect(inboxRepo.save).toHaveBeenCalled();
    expect(allocation.emitAllocationEvents).toHaveBeenCalledWith({
      paymentId: expect.any(String),
      receivableId: 'rec-1',
      amount: 30_000_000,
      allocatedByUserId: null,
      organizationId: 'org-1',
      customerId: 'cust-1',
      becameClosed: true,
    });
  });

  it('does not emit allocation events for the exception-queue branch', async () => {
    const inboxRepo = {
      findById: jest.fn().mockResolvedValue(inbox),
      save: jest.fn(),
    };
    const transactionRepo = { save: jest.fn(), findById: jest.fn() };
    const engine = {
      scoreCandidates: jest
        .fn()
        .mockResolvedValue([
          { receivableId: 'rec-1', customerId: 'cust-1', totalScore: 70 },
        ]),
      toMatchingCandidateEntities: jest.fn().mockReturnValue([]),
    };
    const paymentRepo = { save: jest.fn(), findByIdForUpdate: jest.fn() };
    const allocation = {
      allocateWithinTransaction: jest.fn(),
      emitAllocationEvents: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => {
          const result = await callback({});
          expect(allocation.emitAllocationEvents).not.toHaveBeenCalled();
          return result;
        },
      ),
    };
    const tenant = {
      run: jest.fn((_user: unknown, callback: () => Promise<void>) =>
        callback(),
      ),
    };
    const useCase = new ProcessWebhookUseCase(
      inboxRepo as any,
      transactionRepo as any,
      engine as any,
      { saveMany: jest.fn() } as any,
      paymentRepo as any,
      allocation as any,
      dataSource as any,
      tenant as any,
      { record: jest.fn() } as any,
      { evaluate: jest.fn() } as any,
    );

    await useCase.execute('wh-1', 'org-1');

    expect(allocation.allocateWithinTransaction).not.toHaveBeenCalled();
    expect(allocation.emitAllocationEvents).not.toHaveBeenCalled();
  });

  it('does not emit allocation events for the unmatched branch', async () => {
    const inboxRepo = {
      findById: jest.fn().mockResolvedValue(inbox),
      save: jest.fn(),
    };
    const transactionRepo = { save: jest.fn(), findById: jest.fn() };
    const engine = {
      scoreCandidates: jest.fn().mockResolvedValue([]),
      toMatchingCandidateEntities: jest.fn(),
    };
    const paymentRepo = { save: jest.fn(), findByIdForUpdate: jest.fn() };
    const allocation = {
      allocateWithinTransaction: jest.fn(),
      emitAllocationEvents: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => {
          const result = await callback({});
          expect(allocation.emitAllocationEvents).not.toHaveBeenCalled();
          return result;
        },
      ),
    };
    const tenant = {
      run: jest.fn((_user: unknown, callback: () => Promise<void>) =>
        callback(),
      ),
    };
    const useCase = new ProcessWebhookUseCase(
      inboxRepo as any,
      transactionRepo as any,
      engine as any,
      { saveMany: jest.fn() } as any,
      paymentRepo as any,
      allocation as any,
      dataSource as any,
      tenant as any,
      { record: jest.fn() } as any,
      { evaluate: jest.fn() } as any,
    );

    await useCase.execute('wh-1', 'org-1');

    expect(allocation.allocateWithinTransaction).not.toHaveBeenCalled();
    expect(allocation.emitAllocationEvents).not.toHaveBeenCalled();
  });

  it('evaluates an ambiguous match before the transaction and persists the advisory result', async () => {
    const inboxRepo = {
      findById: jest.fn().mockResolvedValue(inbox),
      save: jest.fn(),
    };
    const transactionRepo = { save: jest.fn(), findById: jest.fn() };
    const engine = {
      scoreCandidates: jest.fn().mockResolvedValue([
        {
          receivableId: 'rec-1',
          customerId: 'cust-1',
          totalScore: 70,
          invoiceNumber: 'INV-1',
          customerName: 'Company B',
          remainingAmount: 30_000_000,
          dueDate: new Date('2026-08-20'),
        },
      ]),
      toMatchingCandidateEntities: jest.fn().mockReturnValue([]),
    };
    const allocation = {
      allocateWithinTransaction: jest.fn(),
      emitAllocationEvents: jest.fn(),
    };
    const order: string[] = [];
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => {
          order.push('transaction');
          return callback({});
        },
      ),
    };
    const tenant = {
      run: jest.fn((_user: unknown, callback: () => Promise<void>) =>
        callback(),
      ),
    };
    const aiRecommendation = {
      status: 'SUCCEEDED',
      recommendedReceivableId: 'rec-1',
      confidence: 80,
      reason: 'Tên và số tiền phù hợp.',
      model: 'gpt-4o-mini',
      promptVersion: 'matching-v1',
      evaluatedAt: '2026-08-05T00:00:00.000Z',
    } as const;
    const aiService = {
      evaluate: jest.fn(async () => {
        order.push('ai');
        return aiRecommendation;
      }),
    };
    const useCase = new ProcessWebhookUseCase(
      inboxRepo as any,
      transactionRepo as any,
      engine as any,
      { saveMany: jest.fn() } as any,
      { save: jest.fn() } as any,
      allocation as any,
      dataSource as any,
      tenant as any,
      { record: jest.fn() } as any,
      aiService as any,
    );

    await useCase.execute('wh-1', 'org-1');

    expect(order).toEqual(['ai', 'transaction']);
    expect(aiService.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        webhookInboxId: 'wh-1',
        candidates: expect.arrayContaining([
          expect.objectContaining({ receivableId: 'rec-1' }),
        ]),
      }),
    );
    expect(transactionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'PENDING_REVIEW',
        aiRecommendation,
      }),
      expect.anything(),
    );
  });

  it('does not invoke AI for an automatic match', async () => {
    const inboxRepo = {
      findById: jest.fn().mockResolvedValue(inbox),
      save: jest.fn(),
    };
    const transactionRepo = { save: jest.fn(), findById: jest.fn() };
    const engine = {
      scoreCandidates: jest.fn().mockResolvedValue([
        {
          receivableId: 'rec-1',
          customerId: 'cust-1',
          totalScore: 95,
          remainingAmount: 30_000_000,
        },
      ]),
      toMatchingCandidateEntities: jest.fn(),
    };
    const aiService = { evaluate: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };
    const tenant = {
      run: jest.fn((_user: unknown, callback: () => Promise<void>) =>
        callback(),
      ),
    };
    const allocation = {
      allocateWithinTransaction: jest
        .fn()
        .mockResolvedValue({ customerId: 'cust-1', becameClosed: false }),
      emitAllocationEvents: jest.fn(),
    };
    const useCase = new ProcessWebhookUseCase(
      inboxRepo as any,
      transactionRepo as any,
      engine as any,
      { saveMany: jest.fn() } as any,
      { save: jest.fn() } as any,
      allocation as any,
      dataSource as any,
      tenant as any,
      { record: jest.fn() } as any,
      aiService as any,
    );

    await useCase.execute('wh-1', 'org-1');

    expect(aiService.evaluate).not.toHaveBeenCalled();
  });

  it('routes to PENDING_REVIEW when two different customers both clear the auto-match threshold', async () => {
    const inboxRepo = {
      findById: jest.fn().mockResolvedValue(inbox),
      save: jest.fn(),
    };
    const transactionRepo = { save: jest.fn(), findById: jest.fn() };
    const engine = {
      scoreCandidates: jest.fn().mockResolvedValue([
        {
          receivableId: 'r1',
          customerId: 'cust-1',
          totalScore: 95,
          remainingAmount: 30_000_000,
        },
        {
          receivableId: 'r2',
          customerId: 'cust-2',
          totalScore: 92,
          remainingAmount: 35_000_000,
        },
      ]),
      toMatchingCandidateEntities: jest.fn().mockReturnValue([]),
    };
    const paymentRepo = { save: jest.fn() };
    const candidateRepo = { saveMany: jest.fn() };
    const allocation = {
      allocateWithinTransaction: jest.fn(),
      emitAllocationEvents: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };
    const tenant = {
      run: jest.fn((_user: unknown, callback: () => Promise<void>) =>
        callback(),
      ),
    };
    const useCase = new ProcessWebhookUseCase(
      inboxRepo as any,
      transactionRepo as any,
      engine as any,
      candidateRepo as any,
      paymentRepo as any,
      allocation as any,
      dataSource as any,
      tenant as any,
      { record: jest.fn() } as any,
      { evaluate: jest.fn() } as any,
    );

    await useCase.execute('wh-1', 'org-1');

    expect(transactionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING_REVIEW' }),
      expect.anything(),
    );
    expect(paymentRepo.save).not.toHaveBeenCalled();
  });

  it.each([ErrorCode.ALLOCATION_EXCEEDS_REMAINING, ErrorCode.CONFLICT])(
    'routes a selected candidate to review if it becomes unavailable (%s)',
    async (errorCode) => {
      const inboxRepo = {
        findById: jest.fn().mockResolvedValue(inbox),
        save: jest.fn(),
      };
      const transactionRepo = { save: jest.fn(), findById: jest.fn() };
      const engine = {
        scoreCandidates: jest.fn().mockResolvedValue([
          {
            receivableId: 'rec-1',
            customerId: 'cust-1',
            totalScore: 95,
            remainingAmount: 31_000_000,
          },
          {
            receivableId: 'rec-2',
            customerId: 'cust-1',
            totalScore: 92,
            remainingAmount: 40_000_000,
          },
        ]),
        toMatchingCandidateEntities: jest.fn().mockReturnValue([]),
      };
      const candidateRepo = { saveMany: jest.fn() };
      const paymentRepo = { save: jest.fn() };
      const allocation = {
        allocateWithinTransaction: jest
          .fn()
          .mockRejectedValue(
            new AppError(errorCode, 'Balance changed before allocation'),
          ),
        emitAllocationEvents: jest.fn(),
      };
      const dataSource = {
        transaction: jest.fn(
          async (callback: (manager: object) => Promise<void>) => callback({}),
        ),
      };
      const tenant = {
        run: jest.fn((_user: unknown, callback: () => Promise<void>) =>
          callback(),
        ),
      };
      const useCase = new ProcessWebhookUseCase(
        inboxRepo as any,
        transactionRepo as any,
        engine as any,
        candidateRepo as any,
        paymentRepo as any,
        allocation as any,
        dataSource as any,
        tenant as any,
        { record: jest.fn() } as any,
        { evaluate: jest.fn() } as any,
      );

      await expect(useCase.execute('wh-1', 'org-1')).resolves.toBeUndefined();

      expect(allocation.allocateWithinTransaction).toHaveBeenCalledTimes(1);
      expect(allocation.allocateWithinTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ receivableId: 'rec-1' }),
      );
      expect(transactionRepo.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'PENDING_REVIEW' }),
        expect.anything(),
      );
      expect(candidateRepo.saveMany).toHaveBeenCalledTimes(1);
      expect(inboxRepo.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'PROCESSED' }),
        expect.anything(),
      );
      expect(allocation.emitAllocationEvents).not.toHaveBeenCalled();
    },
  );

  it('still auto-matches when the second-best candidate is the same customer', async () => {
    const inboxRepo = {
      findById: jest.fn().mockResolvedValue(inbox),
      save: jest.fn(),
    };
    const transactionRepo = { save: jest.fn(), findById: jest.fn() };
    const engine = {
      scoreCandidates: jest.fn().mockResolvedValue([
        {
          receivableId: 'r1',
          customerId: 'cust-1',
          totalScore: 95,
          remainingAmount: 30_000_000,
        },
        {
          receivableId: 'r2',
          customerId: 'cust-1',
          totalScore: 91,
          remainingAmount: 35_000_000,
        },
      ]),
      toMatchingCandidateEntities: jest.fn().mockReturnValue([]),
    };
    const paymentRepo = { save: jest.fn() };
    const candidateRepo = { saveMany: jest.fn() };
    const allocation = {
      allocateWithinTransaction: jest
        .fn()
        .mockResolvedValue({ customerId: 'cust-1', becameClosed: false }),
      emitAllocationEvents: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };
    const tenant = {
      run: jest.fn((_user: unknown, callback: () => Promise<void>) =>
        callback(),
      ),
    };
    const useCase = new ProcessWebhookUseCase(
      inboxRepo as any,
      transactionRepo as any,
      engine as any,
      candidateRepo as any,
      paymentRepo as any,
      allocation as any,
      dataSource as any,
      tenant as any,
      { record: jest.fn() } as any,
      { evaluate: jest.fn() } as any,
    );

    await useCase.execute('wh-1', 'org-1');

    expect(paymentRepo.save).toHaveBeenCalledTimes(1);
  });
});
