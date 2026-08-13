import { randomUUID } from 'node:crypto';
import {
  PlanId,
  ReceivableStatus,
  SubscriptionStatus,
} from '@casso-ledger/shared-types';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { SubscriptionOrmEntity } from '../src/modules/billing/infrastructure/subscription.orm-entity';
import {
  AI_CHAT_PROVIDER,
  type AIChatMessage,
  type AIToolCall,
  type IAIChatProvider,
} from '../src/modules/copilot/application/ai-chat-provider.port';
import { CopilotRateLimitGuard } from '../src/modules/copilot/presentation/copilot-rate-limit.guard';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { EMAIL_PROVIDER_ADAPTER } from '../src/modules/notifications/application/email-provider-adapter.port';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { ReminderExecutionOrmEntity } from '../src/modules/reminders/infrastructure/reminder-execution.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

const mockAiProvider: IAIChatProvider = {
  createChatCompletion: jest.fn(),
};
const mockCreateChatCompletion =
  mockAiProvider.createChatCompletion as jest.Mock;
const mockEmailProvider = {
  send: jest
    .fn()
    .mockResolvedValue({ providerMessageId: 'copilot-test-message' }),
};

const completion = (content: string | null, toolCalls: AIToolCall[] = []) => ({
  content,
  toolCalls,
  inputTokens: 10,
  outputTokens: 5,
});

async function waitUntil(
  check: () => Promise<boolean>,
  timeoutMs = 10_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`waitUntil timed out after ${timeoutMs}ms`);
}

describe('Copilot chat (integration)', () => {
  let postgres: StartedPostgreSqlContainer | undefined;
  let redis: StartedTestContainer | undefined;
  let app: INestApplication | undefined;
  let dataSource: DataSource;
  let jwtService: JwtService;

  beforeAll(async () => {
    [postgres, redis] = await Promise.all([
      new PostgreSqlContainer('postgres:16').start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    ]);
    process.env.DB_HOST = postgres.getHost();
    process.env.DB_PORT = String(postgres.getMappedPort(5432));
    process.env.DB_USERNAME = postgres.getUsername();
    process.env.DB_PASSWORD = postgres.getPassword();
    process.env.DB_DATABASE = postgres.getDatabase();
    process.env.REDIS_HOST = redis.getHost();
    process.env.REDIS_PORT = String(redis.getMappedPort(6379));
    process.env.JWT_SECRET = 'copilot-integration-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'copilot-test-resend-key';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'copilot-test-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'copilot-test-secret';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideModule(TypeOrmModule)
      .useModule(
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: postgres.getHost(),
          port: postgres.getMappedPort(5432),
          username: postgres.getUsername(),
          password: postgres.getPassword(),
          database: postgres.getDatabase(),
          autoLoadEntities: true,
          synchronize: true,
          retryAttempts: 0,
        }),
      )
      .overrideProvider(AI_CHAT_PROVIDER)
      .useValue(mockAiProvider)
      .overrideProvider(EMAIL_PROVIDER_ADAPTER)
      .useValue(mockEmailProvider)
      .overrideGuard(CopilotRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await Promise.all([redis?.stop(), postgres?.stop()]);
  });

  async function setUpOrg(copilotChatMonthlyLimit = 50) {
    const organizationId = randomUUID();
    const userId = randomUUID();
    const customerId = randomUUID();
    const receivableId = randomUUID();
    const conversationId = randomUUID();
    const now = new Date();

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Copilot Test User',
      email: `${userId}@example.com`,
      passwordHash: 'test-hash',
      emailVerifiedAt: now,
      createdAt: now,
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      id: randomUUID(),
      organizationId,
      userId,
      role: Role.FINANCE_MANAGER,
      invitedAt: now,
      joinedAt: now,
      createdAt: now,
    });
    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Công ty Copilot',
      taxCode: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
      email: `customer-${customerId}@example.com`,
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: now,
    });
    await dataSource.getRepository(ReceivableOrmEntity).save({
      id: receivableId,
      organizationId,
      customerId,
      invoiceId: null,
      originalAmount: 10_000_000,
      paidAmount: 0,
      dueDate: new Date('2026-08-01T00:00:00.000Z'),
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: userId,
      createdAt: now,
      closedAt: null,
    });
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    await dataSource.getRepository(SubscriptionOrmEntity).save({
      id: randomUUID(),
      organizationId,
      planId: PlanId.FREE,
      receivableMonthlyLimit: 100,
      bankConnectionLimit: 1,
      copilotChatMonthlyLimit,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      createdAt: now,
    });

    return {
      organizationId,
      userId,
      customerId,
      receivableId,
      conversationId,
      token: jwtService.sign({
        userId,
        organizationId,
        role: Role.FINANCE_MANAGER,
      }),
    };
  }

  async function postChat(
    token: string,
    conversationId: string,
    content: string,
    key: string,
  ) {
    return request(app?.getHttpServer())
      .post(`/api/v1/copilot/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({ content });
  }

  async function createPendingAction(
    fixture: Awaited<ReturnType<typeof setUpOrg>>,
  ) {
    mockCreateChatCompletion.mockImplementationOnce(async () =>
      completion(null, [
        {
          id: 'draft-call',
          name: 'draftReminderEmail',
          arguments: { receivableId: fixture.receivableId },
        },
      ]),
    );
    mockCreateChatCompletion.mockImplementationOnce(
      async (messages: AIChatMessage[]) => {
        const draftMessage = messages
          .filter((message) => message.role === 'tool')
          .at(-1);
        const draft = JSON.parse(draftMessage?.content ?? '{}') as {
          draftId: string;
        };
        return completion('I propose sending this reminder.', [
          {
            id: 'send-call',
            name: 'sendReminderEmail',
            arguments: {
              draftId: draft.draftId,
              receivableId: fixture.receivableId,
            },
          },
        ]);
      },
    );
    const response = await postChat(
      fixture.token,
      fixture.conversationId,
      'Draft and propose a reminder email.',
      `chat-${randomUUID()}`,
    );
    expect(response.status).toBe(201);
    expect(response.body.pendingAction.status).toBe('PENDING');
    return response.body.pendingAction.id as string;
  }

  beforeEach(() => {
    mockCreateChatCompletion.mockReset();
    mockEmailProvider.send.mockClear();
  });

  it('runs two read-tool rounds before a final answer without creating a reminder execution', async () => {
    const fixture = await setUpOrg();
    mockCreateChatCompletion
      .mockResolvedValueOnce(
        completion(null, [
          {
            id: 'summary-call',
            name: 'getReceivableSummary',
            arguments: { customerId: fixture.customerId },
          },
        ]),
      )
      .mockResolvedValueOnce(
        completion(null, [
          {
            id: 'timeline-call',
            name: 'getCollectionActivityTimeline',
            arguments: { customerId: fixture.customerId, limit: 10 },
          },
        ]),
      )
      .mockResolvedValueOnce(
        completion('Không có hoạt động thu tiền gần đây.'),
      );

    const response = await postChat(
      fixture.token,
      fixture.conversationId,
      'Tình hình thu tiền của khách hàng này thế nào?',
      `read-${randomUUID()}`,
    );

    expect(response.status).toBe(201);
    expect(response.body.message.content).toContain('Không có hoạt động');
    expect(mockCreateChatCompletion).toHaveBeenCalledTimes(3);
    expect(
      await dataSource.getRepository(ReminderExecutionOrmEntity).count({
        where: { organizationId: fixture.organizationId },
      }),
    ).toBe(0);
  });

  it('creates exactly one execution when a proposed reminder is confirmed and rejects a second confirmation', async () => {
    const fixture = await setUpOrg();
    const actionId = await createPendingAction(fixture);

    const confirmed = await request(app?.getHttpServer())
      .post(`/api/v1/copilot/actions/${actionId}/confirm`)
      .set('Authorization', `Bearer ${fixture.token}`)
      .set('Idempotency-Key', `confirm-${randomUUID()}`)
      .expect(201);
    expect(confirmed.body.reminderExecutionId).toBeDefined();
    expect(
      await dataSource.getRepository(ReminderExecutionOrmEntity).count({
        where: { organizationId: fixture.organizationId },
      }),
    ).toBe(1);

    await request(app?.getHttpServer())
      .post(`/api/v1/copilot/actions/${actionId}/confirm`)
      .set('Authorization', `Bearer ${fixture.token}`)
      .set('Idempotency-Key', `confirm-again-${randomUUID()}`)
      .expect(409);
    await waitUntil(async () => mockEmailProvider.send.mock.calls.length === 1);
    expect(mockEmailProvider.send).toHaveBeenCalledTimes(1);
  });

  it('does not create an execution when a proposed reminder is cancelled', async () => {
    const fixture = await setUpOrg();
    const actionId = await createPendingAction(fixture);

    await request(app?.getHttpServer())
      .post(`/api/v1/copilot/actions/${actionId}/cancel`)
      .set('Authorization', `Bearer ${fixture.token}`)
      .set('Idempotency-Key', `cancel-${randomUUID()}`)
      .expect(201);
    await request(app?.getHttpServer())
      .post(`/api/v1/copilot/actions/${actionId}/cancel`)
      .set('Authorization', `Bearer ${fixture.token}`)
      .set('Idempotency-Key', `cancel-again-${randomUUID()}`)
      .expect(409);
    expect(
      await dataSource.getRepository(ReminderExecutionOrmEntity).count({
        where: { organizationId: fixture.organizationId },
      }),
    ).toBe(0);
    expect(mockEmailProvider.send).not.toHaveBeenCalled();
  });

  it('keeps concurrent confirmation with the same idempotency key to one execution and one email', async () => {
    const fixture = await setUpOrg();
    const actionId = await createPendingAction(fixture);
    const key = `confirm-race-${randomUUID()}`;
    const responses = await Promise.all([
      request(app?.getHttpServer())
        .post(`/api/v1/copilot/actions/${actionId}/confirm`)
        .set('Authorization', `Bearer ${fixture.token}`)
        .set('Idempotency-Key', key),
      request(app?.getHttpServer())
        .post(`/api/v1/copilot/actions/${actionId}/confirm`)
        .set('Authorization', `Bearer ${fixture.token}`)
        .set('Idempotency-Key', key),
    ]);

    expect(responses.some((response) => response.status === 201)).toBe(true);
    expect(
      responses.every(
        (response) => response.status === 201 || response.status === 409,
      ),
    ).toBe(true);
    expect(
      await dataSource.getRepository(ReminderExecutionOrmEntity).count({
        where: { organizationId: fixture.organizationId },
      }),
    ).toBe(1);
    await waitUntil(async () => mockEmailProvider.send.mock.calls.length === 1);
    expect(mockEmailProvider.send).toHaveBeenCalledTimes(1);
  });

  it('returns PLAN_LIMIT_EXCEEDED on the 51st free-plan chat before calling AI', async () => {
    const fixture = await setUpOrg(50);
    mockCreateChatCompletion.mockResolvedValue(completion('Đã xử lý.'));

    for (let index = 0; index < 50; index += 1) {
      await postChat(
        fixture.token,
        fixture.conversationId,
        `Tin nhắn ${index + 1}`,
        `quota-${index + 1}-${randomUUID()}`,
      ).then((response) => expect(response.status).toBe(201));
    }
    const callsBeforeLimit = mockCreateChatCompletion.mock.calls.length;
    const response = await postChat(
      fixture.token,
      fixture.conversationId,
      'Tin nhắn 51',
      `quota-51-${randomUUID()}`,
    );

    expect(response.status).toBe(402);
    expect(response.body.errorCode).toBe('PLAN_LIMIT_EXCEEDED');
    expect(mockCreateChatCompletion).toHaveBeenCalledTimes(callsBeforeLimit);
  });
});
