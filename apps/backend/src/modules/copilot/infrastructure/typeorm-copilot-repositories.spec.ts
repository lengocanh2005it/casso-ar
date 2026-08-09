import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import { TypeOrmAIUsageLogRepository } from './typeorm-ai-usage-log.repository';
import { TypeOrmCopilotConversationRepository } from './typeorm-copilot-conversation.repository';
import { TypeOrmCopilotDraftRepository } from './typeorm-copilot-draft.repository';
import { TypeOrmCopilotPendingActionRepository } from './typeorm-copilot-pending-action.repository';

const USER = { userId: 'user-1', organizationId: 'org-1', role: Role.OWNER };

describe('Copilot TypeORM repositories', () => {
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
    const conversationRepo = { findOne: jest.fn() };
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
