import { randomUUID } from 'node:crypto';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CustomerGroup } from '../src/modules/customers/domain/customer-group';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { InternalTaskOrmEntity } from '../src/modules/internal-tasks/infrastructure/internal-task.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { OrganizationOrmEntity } from '../src/modules/organizations/infrastructure/organization.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { ReminderPolicyOrmEntity } from '../src/modules/reminders/infrastructure/reminder-policy.orm-entity';

describe('Internal task escalation (integration)', () => {
  let pgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedTestContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let organizationId: string;
  let receivableId: string;
  let financeManagerId: string;

  beforeAll(async () => {
    [pgContainer, redisContainer] = await Promise.all([
      new PostgreSqlContainer('postgres:16').start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    ]);

    process.env.DB_HOST = pgContainer.getHost();
    process.env.DB_PORT = String(pgContainer.getMappedPort(5432));
    process.env.DB_USERNAME = pgContainer.getUsername();
    process.env.DB_PASSWORD = pgContainer.getPassword();
    process.env.DB_DATABASE = pgContainer.getDatabase();
    process.env.REDIS_HOST = redisContainer.getHost();
    process.env.REDIS_PORT = String(redisContainer.getMappedPort(6379));
    process.env.JWT_SECRET = 'internal-task-escalation-integration-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'integration-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'integration-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);

    organizationId = randomUUID();
    financeManagerId = randomUUID();
    const ownerId = randomUUID();
    const customerId = randomUUID();
    receivableId = randomUUID();
    const now = new Date();

    await dataSource.getRepository(OrganizationOrmEntity).save({
      id: organizationId,
      name: 'Escalation Integration Organization',
      createdAt: now,
    });
    await dataSource.getRepository(MembershipOrmEntity).save([
      {
        id: randomUUID(),
        organizationId,
        userId: financeManagerId,
        role: Role.FINANCE_MANAGER,
        invitedAt: now,
        joinedAt: now,
        createdAt: now,
      },
      {
        id: randomUUID(),
        organizationId,
        userId: ownerId,
        role: Role.OWNER,
        invitedAt: now,
        joinedAt: now,
        createdAt: now,
      },
    ]);
    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Escalation Customer',
      taxCode: 'ESCALATION-TAX',
      email: 'escalation@example.com',
      phone: '',
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      customerGroup: CustomerGroup.REGULAR,
      createdAt: now,
    });
    await dataSource.getRepository(ReminderPolicyOrmEntity).save({
      id: randomUUID(),
      organizationId,
      customerGroup: CustomerGroup.REGULAR,
      isActive: true,
      escalationThresholdDays: 10,
      createdAt: now,
    });
    await dataSource.getRepository(ReceivableOrmEntity).save({
      id: receivableId,
      organizationId,
      customerId,
      invoiceId: null,
      originalAmount: 1000,
      paidAmount: 0,
      dueDate: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: null,
      createdAt: now,
      closedAt: null,
      version: 1,
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await redisContainer?.stop();
    await pgContainer?.stop();
  });

  it('creates one escalation task when the reminder scan completes and stays idempotent', async () => {
    const eventEmitter = app.get(EventEmitter2);
    await eventEmitter.emitAsync('reminder.scan.completed', {
      organizationId,
      scanDate: '2026-08-09',
    });

    const taskRepository = dataSource.getRepository(InternalTaskOrmEntity);
    const tasksAfterFirstScan = await taskRepository.find({
      where: { organizationId, receivableId },
    });
    expect(tasksAfterFirstScan).toHaveLength(1);
    expect(tasksAfterFirstScan[0]).toEqual(
      expect.objectContaining({
        receivableId,
        assignedToUserId: financeManagerId,
        taskType: 'ESCALATION',
        status: 'OPEN',
      }),
    );

    await eventEmitter.emitAsync('reminder.scan.completed', {
      organizationId,
      scanDate: '2026-08-10',
    });

    const tasksAfterSecondScan = await taskRepository.find({
      where: { organizationId, receivableId },
    });
    expect(tasksAfterSecondScan).toHaveLength(1);

    await eventEmitter.emitAsync('receivable.status-closed', {
      organizationId,
      receivableId,
    });

    const tasksAfterClosure = await taskRepository.find({
      where: { organizationId, receivableId },
    });
    expect(tasksAfterClosure[0].status).toBe('DISMISSED');
  }, 30_000);
});
