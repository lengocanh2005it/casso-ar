import { randomUUID } from 'node:crypto';
import { PlanId, SubscriptionStatus } from '@casso-ar/shared-types';
import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import type { Job, Queue } from 'bullmq';
import request from 'supertest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { SubscriptionOrmEntity } from '../src/modules/billing/infrastructure/subscription.orm-entity';
import { EMAIL_PROVIDER_ADAPTER } from '../src/modules/notifications/application/email-provider-adapter.port';
import { EMAIL_PROVIDER_RESOLVER } from '../src/modules/notifications/application/email-provider-resolver.port';
import {
  EMAIL_QUEUE_PORT,
  type IEmailQueue,
} from '../src/modules/notifications/application/email-queue.port';
import { EMAIL_QUEUE } from '../src/modules/notifications/infrastructure/email-queue.constants';
import { EmailQueueProcessor } from '../src/modules/notifications/infrastructure/email-queue.processor';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { OrganizationOrmEntity } from '../src/modules/organizations/infrastructure/organization.orm-entity';
import { ReminderExecutionStatus } from '../src/modules/reminders/domain/reminder-execution';
import { ReminderExecutionOrmEntity } from '../src/modules/reminders/infrastructure/reminder-execution.orm-entity';
import { SMTP_TRANSPORT_FACTORY } from '../src/modules/smtp-config/application/test-and-save-smtp-config.usecase';
import { SmtpConfigStatus } from '../src/modules/smtp-config/domain/organization-smtp-config';
import { OrganizationSmtpConfigOrmEntity } from '../src/modules/smtp-config/infrastructure/organization-smtp-config.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

jest.setTimeout(60_000);

describe('BYO SMTP configuration and fallback (e2e)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let redis: StartedTestContainer | undefined;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let queue: Queue;
  let smtpVerify: jest.Mock;
  let smtpSendMail: jest.Mock;
  let smtpFactory: jest.Mock;
  let resendAdapter: { send: jest.Mock };
  let resolver: { resolve: jest.Mock };

  beforeAll(async () => {
    // Own Redis: the .env Redis is shared with any running dev backend, whose
    // BullMQ workers would steal this test's queue jobs.
    [container, redis] = await Promise.all([
      new PostgreSqlContainer('postgres:16').start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    ]);
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.REDIS_HOST = redis.getHost();
    process.env.REDIS_PORT = String(redis.getMappedPort(6379));
    process.env.JWT_SECRET = 'smtp-e2e-jwt-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'smtp-e2e-resend-key';
    process.env.SMTP_HOST_ALLOWLIST = 'smtp.example.com';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'smtp-e2e-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'smtp-e2e-secret';

    smtpVerify = jest.fn().mockResolvedValue(true);
    smtpSendMail = jest.fn().mockResolvedValue({ messageId: 'smtp-test-1' });
    smtpFactory = jest.fn().mockReturnValue({
      verify: smtpVerify,
      sendMail: smtpSendMail,
    });
    resendAdapter = {
      send: jest.fn().mockResolvedValue({ providerMessageId: 'resend-1' }),
    };
    resolver = { resolve: jest.fn() };
    resolver.resolve.mockImplementation(
      async (organizationId: string, force?: 'RESEND') => {
        if (force === 'RESEND') return resendAdapter;
        const config = await dataSource
          .getRepository(OrganizationSmtpConfigOrmEntity)
          .findOne({ where: { organizationId } });
        return config?.status === 'CONNECTED'
          ? { send: jest.fn().mockRejectedValue(new Error('smtp down')) }
          : resendAdapter;
      },
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideModule(TypeOrmModule)
      .useModule(
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: container.getHost(),
          port: container.getMappedPort(5432),
          username: container.getUsername(),
          password: container.getPassword(),
          database: container.getDatabase(),
          autoLoadEntities: true,
          synchronize: true,
          retryAttempts: 0,
        }),
      )
      .overrideProvider(EMAIL_PROVIDER_ADAPTER)
      .useValue(resendAdapter)
      .overrideProvider(EMAIL_PROVIDER_RESOLVER)
      .useValue(resolver)
      .overrideProvider(SMTP_TRANSPORT_FACTORY)
      .useValue(smtpFactory)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);
    queue = moduleRef.get<Queue>(getQueueToken(EMAIL_QUEUE));
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await Promise.all([redis?.stop(), container?.stop()]);
  }, 60_000);

  async function setUpOrganization(canUseCustomSmtp: boolean) {
    const organizationId = randomUUID();
    const ownerId = randomUUID();
    const financeId = randomUUID();
    const now = new Date();
    const ownerEmail = `smtp-owner-${organizationId}@example.com`;

    await dataSource.getRepository(OrganizationOrmEntity).save({
      id: organizationId,
      name: 'SMTP Test Organization',
      createdAt: now,
    });
    await dataSource.getRepository(UserOrmEntity).save([
      {
        id: ownerId,
        name: 'SMTP Owner',
        email: ownerEmail,
        passwordHash: 'test-hash',
        emailVerifiedAt: now,
        createdAt: now,
      },
      {
        id: financeId,
        name: 'SMTP Finance Manager',
        email: `smtp-finance-${organizationId}@example.com`,
        passwordHash: 'test-hash',
        emailVerifiedAt: now,
        createdAt: now,
      },
    ]);
    await dataSource.getRepository(MembershipOrmEntity).save([
      {
        organizationId,
        userId: ownerId,
        role: Role.OWNER,
        invitedAt: now,
        joinedAt: now,
        createdAt: now,
      },
      {
        organizationId,
        userId: financeId,
        role: Role.FINANCE_MANAGER,
        invitedAt: now,
        joinedAt: now,
        createdAt: now,
      },
    ]);
    await dataSource.getRepository(SubscriptionOrmEntity).save({
      id: randomUUID(),
      organizationId,
      planId: canUseCustomSmtp ? PlanId.BUSINESS : PlanId.FREE,
      receivableMonthlyLimit: 50,
      bankConnectionLimit: 1,
      copilotChatMonthlyLimit: 50,
      canUseCustomSmtp,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date('2026-08-01'),
      currentPeriodEnd: new Date('2026-09-01'),
      createdAt: now,
    });

    return {
      organizationId,
      ownerToken: jwtService.sign({
        userId: ownerId,
        organizationId,
        role: Role.OWNER,
      }),
      financeToken: jwtService.sign({
        userId: financeId,
        organizationId,
        role: Role.FINANCE_MANAGER,
      }),
    };
  }

  async function waitForExecutionStatus(
    id: string,
    expectedStatus: ReminderExecutionStatus,
  ) {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const execution = await dataSource
        .getRepository(ReminderExecutionOrmEntity)
        .findOneBy({ id });
      if (execution?.status === expectedStatus) return execution;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for reminder execution ${id}`);
  }

  it('allows only OWNER to manage SMTP configuration', async () => {
    const { financeToken } = await setUpOrganization(true);

    await request(app.getHttpServer())
      .post('/api/v1/smtp-config')
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        host: 'smtp.example.com',
        port: 587,
        username: 'noreply@example.com',
        password: 'secret',
        fromAddress: 'noreply@example.com',
      })
      .expect(403);
  });

  it('does not persist a config when the SMTP test fails', async () => {
    const { ownerToken } = await setUpOrganization(true);
    smtpVerify.mockRejectedValueOnce(new Error('auth rejected'));

    await request(app.getHttpServer())
      .post('/api/v1/smtp-config')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        host: 'smtp.example.com',
        port: 587,
        username: 'noreply@example.com',
        password: 'secret',
        fromAddress: 'noreply@example.com',
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.errorCode).toBe('SMTP_CONNECTION_FAILED');
      });

    await request(app.getHttpServer())
      .get('/api/v1/smtp-config')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });

  it('test-saves a connected config without exposing its encrypted password', async () => {
    const { ownerToken } = await setUpOrganization(true);
    smtpVerify.mockResolvedValue(true);
    smtpSendMail.mockResolvedValue({ messageId: 'smtp-test-success' });

    await request(app.getHttpServer())
      .post('/api/v1/smtp-config')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        host: 'smtp.example.com',
        port: 587,
        username: 'noreply@example.com',
        password: 'secret',
        fromAddress: 'noreply@example.com',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/api/v1/smtp-config')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(response.body).toEqual({
      host: 'smtp.example.com',
      port: 587,
      username: 'noreply@example.com',
      fromAddress: 'noreply@example.com',
      status: 'CONNECTED',
    });
    expect(response.body.encryptedPassword).toBeUndefined();
  });

  it('marks failed SMTP, warns once, requeues through Resend, then sends the reminder', async () => {
    const { organizationId } = await setUpOrganization(true);
    const config = await dataSource
      .getRepository(OrganizationSmtpConfigOrmEntity)
      .save({
        id: randomUUID(),
        organizationId,
        host: 'smtp.example.com',
        port: 587,
        username: 'noreply@example.com',
        encryptedPassword: 'ciphertext',
        fromAddress: 'noreply@example.com',
        status: SmtpConfigStatus.CONNECTED,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    const reminderExecutionId = randomUUID();
    await dataSource.getRepository(ReminderExecutionOrmEntity).save({
      id: reminderExecutionId,
      organizationId,
      receivableId: randomUUID(),
      reminderRuleId: null,
      executionDate: new Date('2026-08-11'),
      sentAt: null,
      status: ReminderExecutionStatus.PENDING,
      skipReason: null,
      providerMessageId: null,
      failureReason: null,
    });

    resendAdapter.send.mockClear();
    await queue.pause();
    const processor = app.get(EmailQueueProcessor);
    const isCurrentFailure = jest
      .spyOn(
        app.get<IEmailQueue>(EMAIL_QUEUE_PORT),
        'isReminderJobFailureCurrent',
      )
      .mockResolvedValue(true);
    let fallback: Job | undefined;
    try {
      await processor.onFailed({
        id: reminderExecutionId,
        name: 'send-reminder-email',
        data: {
          reminderExecutionId,
          receivableId: randomUUID(),
          organizationId,
          to: 'customer@example.com',
          replyTo: 'wrong-reply-to@example.com',
          subject: 'Reminder',
          html: '<p>Reminder</p>',
        },
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as Job);
      expect(isCurrentFailure).toHaveBeenCalledWith(reminderExecutionId, 3);

      const failedConfig = await dataSource
        .getRepository(OrganizationSmtpConfigOrmEntity)
        .findOneByOrFail({ id: config.id });
      expect(failedConfig.status).toBe(SmtpConfigStatus.FAILED);
      expect(resendAdapter.send).toHaveBeenCalledTimes(1);
      expect(resendAdapter.send.mock.calls[0][0]).toBe(
        `smtp-owner-${organizationId}@example.com`,
      );
      const pending = await dataSource
        .getRepository(ReminderExecutionOrmEntity)
        .findOneByOrFail({ id: reminderExecutionId });
      expect(pending.status).toBe(ReminderExecutionStatus.PENDING);

      fallback = await queue.getJob(`${reminderExecutionId}-resend-fallback`);
      expect(fallback).not.toBeNull();
    } finally {
      await queue.resume();
    }
    await waitForExecutionStatus(
      reminderExecutionId,
      ReminderExecutionStatus.SENT,
    );
    expect(resendAdapter.send).toHaveBeenCalledTimes(2);
    await fallback?.remove();
  }, 20_000);

  it('routes a FREE-tier organization without SMTP config through Resend', async () => {
    const { organizationId } = await setUpOrganization(false);
    const reminderExecutionId = randomUUID();
    await dataSource.getRepository(ReminderExecutionOrmEntity).save({
      id: reminderExecutionId,
      organizationId,
      receivableId: randomUUID(),
      reminderRuleId: null,
      executionDate: new Date('2026-08-11'),
      sentAt: null,
      status: ReminderExecutionStatus.PENDING,
      skipReason: null,
      providerMessageId: null,
      failureReason: null,
    });

    resendAdapter.send.mockClear();
    await app.get(EmailQueueProcessor).process({
      id: reminderExecutionId,
      name: 'send-reminder-email',
      data: {
        reminderExecutionId,
        receivableId: randomUUID(),
        organizationId,
        to: 'customer@example.com',
        subject: 'Reminder',
        html: '<p>Reminder</p>',
      },
      attemptsMade: 1,
      opts: { attempts: 3 },
    } as Job);

    expect(resendAdapter.send).toHaveBeenCalledWith(
      'customer@example.com',
      'Reminder',
      '<p>Reminder</p>',
      { reminderExecutionId },
      undefined,
      undefined,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        idempotencyKey: expect.stringMatching(/^reminder-/),
      }),
    );
  }, 20_000);
});
