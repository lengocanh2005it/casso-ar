import { randomUUID } from 'node:crypto';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { ReminderExecutionStatus } from '../src/modules/reminders/domain/reminder-execution';
import { ReminderExecutionOrmEntity } from '../src/modules/reminders/infrastructure/reminder-execution.orm-entity';
import { TypeOrmDashboardSummaryRepository } from '../src/modules/reporting/infrastructure/typeorm-dashboard-summary.repository';

describe('TypeOrmDashboardSummaryRepository.getReminderEffectivenessStats (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let repo: TypeOrmDashboardSummaryRepository;

  const organizationId = '00000000-0000-0000-0000-0000000000f1';

  const paidWithin7d = '00000000-0000-0000-0000-0000000000f2';
  const paidLate = '00000000-0000-0000-0000-0000000000f3';
  const stillOpen = '00000000-0000-0000-0000-0000000000f4';

  const PERIOD = { from: new Date('2026-08-01'), to: new Date('2026-08-31') };

  function receivable(id: string, status: ReceivableStatus) {
    return {
      id,
      organizationId,
      customerId: '00000000-0000-0000-0000-0000000000f5',
      invoiceId: null,
      originalAmount: 1_000_000,
      paidAmount: status === ReceivableStatus.PAID ? 1_000_000 : 0,
      dueDate: new Date('2026-08-01'),
      status,
      salesRepresentativeId: null,
      createdAt: new Date('2026-07-01'),
      closedAt:
        status === ReceivableStatus.PAID ? new Date('2026-08-10') : null,
      version: 1,
    };
  }

  function execution(
    receivableId: string,
    sentAt: Date,
    status: ReminderExecutionStatus,
  ) {
    return {
      id: randomUUID(),
      organizationId,
      receivableId,
      reminderRuleId: null,
      executionDate: sentAt,
      sentAt,
      status,
      skipReason: null,
      providerMessageId: null,
      failureReason: null,
      createdAt: sentAt,
    };
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.RESEND_API_KEY = 'reminder-effectiveness-e2e-resend-key';
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: container.getHost(),
          port: container.getMappedPort(5432),
          username: container.getUsername(),
          password: container.getPassword(),
          database: container.getDatabase(),
          entities: [ReceivableOrmEntity, ReminderExecutionOrmEntity],
          synchronize: true,
          retryAttempts: 0,
        }),
        TypeOrmModule.forFeature([
          ReceivableOrmEntity,
          ReminderExecutionOrmEntity,
        ]),
      ],
      providers: [TypeOrmDashboardSummaryRepository],
    }).compile();

    dataSource = moduleRef.get(DataSource);
    repo = moduleRef.get(TypeOrmDashboardSummaryRepository);

    await dataSource
      .getRepository(ReceivableOrmEntity)
      .save([
        receivable(paidWithin7d, ReceivableStatus.PAID),
        receivable(paidLate, ReceivableStatus.PAID),
        receivable(stillOpen, ReceivableStatus.OPEN),
      ]);

    await dataSource.getRepository(ReminderExecutionOrmEntity).save([
      // paidWithin7d: latest send 08-05, receivable paid 08-10 (within 7d)
      execution(
        paidWithin7d,
        new Date('2026-08-01'),
        ReminderExecutionStatus.SENT,
      ),
      execution(
        paidWithin7d,
        new Date('2026-08-05'),
        ReminderExecutionStatus.SENT,
      ),
      // paidLate: latest send 08-02, receivable paid 08-10 (8 days later)
      execution(paidLate, new Date('2026-08-02'), ReminderExecutionStatus.SENT),
      // stillOpen: sends in period, never paid
      execution(
        stillOpen,
        new Date('2026-08-03'),
        ReminderExecutionStatus.SENT,
      ),
      // paidWithin7d: an even later send outside the period (09-02) must
      // disqualify the 08-05 execution from paidWithin7d
      execution(
        paidWithin7d,
        new Date('2026-09-02'),
        ReminderExecutionStatus.SENT,
      ),
    ]);
  }, 60_000);

  afterAll(async () => {
    await dataSource.destroy();
    await container.stop();
  });

  it('counts only latest sends that led to payment within 7 days', async () => {
    const stats = await repo.getReminderEffectivenessStats(
      organizationId,
      PERIOD,
    );

    expect(stats.sentCount).toBe(4);
    expect(stats.paidWithin7dCount).toBe(0);
  });
});
