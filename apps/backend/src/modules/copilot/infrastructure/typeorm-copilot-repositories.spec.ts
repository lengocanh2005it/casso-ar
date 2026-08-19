import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import { TypeOrmAIUsageLogRepository } from './typeorm-ai-usage-log.repository';
import { TypeOrmCopilotConversationRepository } from './typeorm-copilot-conversation.repository';
import { TypeOrmCopilotDraftRepository } from './typeorm-copilot-draft.repository';
import { TypeOrmCopilotPendingActionRepository } from './typeorm-copilot-pending-action.repository';

const USER = { userId: 'user-1', organizationId: 'org-1', role: Role.OWNER };

describe('Copilot TypeORM repositories', () => {
  it("does not read or append messages for another user's conversation", async () => {
    const messageRepo = {
      find: jest.fn(),
      save: jest.fn(),
    };
    const conversationRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmCopilotConversationRepository(
      conversationRepo as any,
      messageRepo as any,
      tenantContext,
    );

    await tenantContext.run(USER, async () => {
      await expect(repository.listMessages('conversation-2')).resolves.toEqual(
        [],
      );
      await expect(
        repository.appendMessage({
          conversationId: 'conversation-2',
          role: 'USER',
          content: 'should not append',
          toolCalls: null,
          createdAt: new Date('2026-08-09'),
        }),
      ).rejects.toMatchObject({ errorCode: 'FORBIDDEN' });
    });

    expect(messageRepo.find).not.toHaveBeenCalled();
    expect(messageRepo.save).not.toHaveBeenCalled();
  });

  it('returns only the 20 newest messages in their original order', async () => {
    const messages = Array.from({ length: 25 }, (_, index) => ({
      id: `message-${index + 1}`,
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      role: 'USER',
      content: `message ${index + 1}`,
      toolCalls: null,
      createdAt: new Date(
        `2026-08-09T00:${String(index).padStart(2, '0')}:00Z`,
      ),
    }));
    const messageRepo = {
      find: jest
        .fn()
        .mockImplementation((options: { order: { createdAt: string } }) =>
          options.order.createdAt === 'DESC'
            ? [...messages].reverse().slice(0, 20)
            : messages,
        ),
    };
    const conversationRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'conversation-1',
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    };
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmCopilotConversationRepository(
      conversationRepo as any,
      messageRepo as any,
      tenantContext,
    );

    const result = await tenantContext.run(USER, () =>
      repository.listMessages('conversation-1'),
    );

    expect(result.map((message) => message.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `message-${index + 6}`),
    );
    expect(messageRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { createdAt: 'DESC' },
        take: 20,
      }),
    );
  });

  it('appends a conversation message with the current organization', async () => {
    const messageRepo = {
      save: jest.fn().mockResolvedValue({
        id: 'message-1',
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        role: 'USER',
        content: 'hello',
        toolCalls: null,
        createdAt: new Date('2026-08-09'),
      }),
    };
    const conversationRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'conversation-1',
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    };
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmCopilotConversationRepository(
      conversationRepo as any,
      messageRepo as any,
      tenantContext,
    );

    const result = await tenantContext.run(USER, () =>
      repository.appendMessage({
        conversationId: 'conversation-1',
        role: 'USER',
        content: 'hello',
        toolCalls: null,
        createdAt: new Date('2026-08-09'),
      }),
    );

    expect(result.id).toBe('message-1');
    expect(messageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
    );
  });

  it('atomically confirms only a pending action in the current organization', async () => {
    const raw = {
      id: 'action-1',
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      actionType: 'SEND_REMINDER_EMAIL',
      payload: { draftId: 'draft-1', receivableId: 'receivable-1' },
      status: 'CONFIRMED',
      createdAt: new Date('2026-08-09'),
      resolvedAt: new Date('2026-08-09'),
      resolvedByUserId: 'user-1',
    };
    const query = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: [raw] }),
    };
    const ormRepo = { createQueryBuilder: jest.fn().mockReturnValue(query) };
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmCopilotPendingActionRepository(
      ormRepo as any,
      tenantContext,
    );

    const result = await tenantContext.run(USER, () =>
      repository.confirmIfPending('action-1', 'user-1'),
    );

    expect(result?.status).toBe('CONFIRMED');
    expect(query.andWhere).toHaveBeenCalledWith('status = :status', {
      status: 'PENDING',
    });
    expect(query.returning).toHaveBeenCalledWith('*');
  });

  it('saves drafts with the current organization', async () => {
    const ormRepo = { save: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmCopilotDraftRepository(
      ormRepo as any,
      tenantContext,
    );

    await tenantContext.run(USER, () =>
      repository.save({
        id: 'draft-1',
        organizationId: 'org-1',
        userId: 'user-1',
        receivableId: 'receivable-1',
        recipientEmail: 'ap@example.com',
        subject: 'Reminder',
        bodyHtml: '<p>Hello</p>',
        createdAt: new Date('2026-08-09'),
      }),
    );

    expect(ormRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'draft-1', organizationId: 'org-1' }),
    );
  });

  it('stores the given title only when creating a new conversation row', async () => {
    const conversationRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((row) => Promise.resolve(row)),
    };
    const messageRepo = { find: jest.fn(), save: jest.fn() };
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmCopilotConversationRepository(
      conversationRepo as any,
      messageRepo as any,
      tenantContext,
    );

    await tenantContext.run(USER, async () => {
      await repository.findOrCreate(
        'conversation-1',
        'user-1',
        'Hỏi về công nợ',
      );
    });

    expect(conversationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'conversation-1',
        title: 'Hỏi về công nợ',
      }),
    );
  });

  it('findById returns null outside the organization and the row inside it', async () => {
    const conversationRepo = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'conversation-1',
          organizationId: 'org-1',
          userId: 'user-2',
          customerId: null,
          title: 'Hỏi về công nợ',
          createdAt: new Date('2026-08-09'),
        }),
    };
    const messageRepo = { find: jest.fn(), save: jest.fn() };
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmCopilotConversationRepository(
      conversationRepo as any,
      messageRepo as any,
      tenantContext,
    );

    await tenantContext.run(USER, async () => {
      await expect(repository.findById('missing')).resolves.toBeNull();
      await expect(
        repository.findById('conversation-1'),
      ).resolves.toMatchObject({
        id: 'conversation-1',
        userId: 'user-2',
        title: 'Hỏi về công nợ',
      });
    });
  });

  it('listByUser paginates conversations ordered by their newest message', async () => {
    const rawMany = [
      {
        id: 'conversation-2',
        title: 'Hỏi mới nhất',
        createdAt: new Date('2026-08-10'),
        lastMessageAt: new Date('2026-08-10T01:00:00Z'),
      },
    ];
    const qb = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rawMany),
    };
    const conversationRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      count: jest.fn().mockResolvedValue(1),
    };
    const messageRepo = { find: jest.fn(), save: jest.fn() };
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmCopilotConversationRepository(
      conversationRepo as any,
      messageRepo as any,
      tenantContext,
    );

    await tenantContext.run(USER, async () => {
      await expect(repository.listByUser('user-1', 1, 20)).resolves.toEqual({
        items: [
          {
            id: 'conversation-2',
            title: 'Hỏi mới nhất',
            createdAt: rawMany[0].createdAt,
            lastMessageAt: rawMany[0].lastMessageAt,
          },
        ],
        total: 1,
      });
    });
    expect(qb.andWhere).toHaveBeenCalledWith('conversation.userId = :userId', {
      userId: 'user-1',
    });
  });

  it('records usage logs with the current organization', async () => {
    const ormRepo = { save: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmAIUsageLogRepository(
      ormRepo as any,
      tenantContext,
    );

    await tenantContext.run(USER, () =>
      repository.log({
        conversationId: 'conversation-1',
        model: 'gpt-4o-mini',
        promptVersion: 'copilot-v1',
        inputTokens: 10,
        outputTokens: 5,
        latencyMs: 100,
        toolCallsCount: 0,
        isError: false,
      }),
    );

    expect(ormRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        conversationId: 'conversation-1',
      }),
    );
  });
});
