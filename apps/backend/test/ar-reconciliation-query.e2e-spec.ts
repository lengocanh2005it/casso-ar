import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { LedgerEventSubjectType } from '../src/modules/ledger/domain/ledger-event-subject-type';
import { TypeOrmArReconciliationQuery } from '../src/modules/ledger/infrastructure/typeorm-ar-reconciliation-query';

const organizationId = '00000000-0000-4000-8000-000000000001';
const otherOrganizationId = '00000000-0000-4000-8000-000000000002';
const receivableOneId = '10000000-0000-4000-8000-000000000001';
const receivableTwoId = '10000000-0000-4000-8000-000000000002';
const paymentId = '20000000-0000-4000-8000-000000000001';
const otherReceivableId = '10000000-0000-4000-8000-000000000099';

jest.setTimeout(60_000);

describe('TypeOrmArReconciliationQuery (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let testModule: TestingModule;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    dataSource = new DataSource({
      type: 'postgres',
      host: container.getHost(),
      port: container.getMappedPort(5432),
      username: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
    });
    await dataSource.initialize();
    await dataSource.query(`
      CREATE TYPE ledger_events_subjecttype_enum AS ENUM ('RECEIVABLE', 'PAYMENT');
      CREATE TABLE receivables (
        id uuid PRIMARY KEY,
        "organizationId" varchar NOT NULL,
        "originalAmount" bigint NOT NULL,
        "paidAmount" bigint NOT NULL,
        status varchar NOT NULL,
        "createdAt" timestamptz NOT NULL
      );
      CREATE TABLE payments (
        id uuid PRIMARY KEY,
        "organizationId" varchar NOT NULL,
        "totalAmount" bigint NOT NULL,
        "allocatedAmount" bigint NOT NULL,
        "createdAt" timestamptz NOT NULL
      );
      CREATE TABLE payment_allocations (
        id uuid PRIMARY KEY,
        "organizationId" varchar NOT NULL,
        "paymentId" varchar NOT NULL,
        "receivableId" varchar NOT NULL,
        "allocatedAmount" bigint NOT NULL,
        "deletedAt" timestamptz
      );
      CREATE TABLE ledger_events (
        id uuid PRIMARY KEY,
        "organizationId" varchar NOT NULL,
        "subjectType" ledger_events_subjecttype_enum NOT NULL,
        "subjectId" uuid NOT NULL,
        kind varchar NOT NULL,
        amount bigint NOT NULL
      );
    `);
    testModule = await Test.createTestingModule({
      providers: [
        TypeOrmArReconciliationQuery,
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    await dataSource.query(
      `INSERT INTO receivables (id, "organizationId", "originalAmount", "paidAmount", status, "createdAt") VALUES
        ($1, $3, 1000, 150, 'PARTIALLY_PAID', NOW()),
        ($2, $3, 400, 150, 'PARTIALLY_PAID', NOW()),
        ('10000000-0000-4000-8000-000000000003', $3, 300, 0, 'WRITTEN_OFF', NOW()),
        ('10000000-0000-4000-8000-000000000004', $3, 400, 0, 'CANCELLED', NOW()),
        ($4, $5, 2000, 999, 'PARTIALLY_PAID', NOW())`,
      [
        receivableOneId,
        receivableTwoId,
        organizationId,
        otherReceivableId,
        otherOrganizationId,
      ],
    );
    await dataSource.query(
      `INSERT INTO payments (id, "organizationId", "totalAmount", "allocatedAmount", "createdAt")
       VALUES ($1, $2, 600, 200, NOW())`,
      [paymentId, organizationId],
    );
    await dataSource.query(
      `INSERT INTO payment_allocations (id, "organizationId", "paymentId", "receivableId", "allocatedAmount", "deletedAt") VALUES
        ('30000000-0000-4000-8000-000000000001', $1, $2, $3, 100, NULL),
        ('30000000-0000-4000-8000-000000000002', $1, $2, $3, 50, NULL),
        ('30000000-0000-4000-8000-000000000003', $1, $2, $3, 900, NOW()),
        ('30000000-0000-4000-8000-000000000004', $1, $2, $4, 150, NULL),
        ('30000000-0000-4000-8000-000000000005', $1, $2, $4, 100, NOW()),
        ('30000000-0000-4000-8000-000000000006', $5, $2, $3, 600, NULL)`,
      [
        organizationId,
        paymentId,
        receivableOneId,
        receivableTwoId,
        otherOrganizationId,
      ],
    );
    await dataSource.query(
      `INSERT INTO ledger_events (id, "organizationId", "subjectType", "subjectId", kind, amount) VALUES
        ('40000000-0000-4000-8000-000000000001', $1, 'RECEIVABLE', $2, 'RECEIVABLE_ROLLOUT_BASELINE', 850),
        ('40000000-0000-4000-8000-000000000002', $1, 'PAYMENT', $2, 'PAYMENT_ROLLOUT_BASELINE', 999),
        ('40000000-0000-4000-8000-000000000003', $1, 'PAYMENT', $3, 'PAYMENT_ROLLOUT_BASELINE', 400),
        ('40000000-0000-4000-8000-000000000004', $1, 'RECEIVABLE', $3, 'RECEIVABLE_CREATED', 777),
        ('40000000-0000-4000-8000-000000000005', $4, 'RECEIVABLE', $2, 'RECEIVABLE_ROLLOUT_BASELINE', 6000),
        ('40000000-0000-4000-8000-000000000006', $1, 'RECEIVABLE', '10000000-0000-4000-8000-000000000003', 'RECEIVABLE_CREATED', 300),
        ('40000000-0000-4000-8000-000000000007', $1, 'RECEIVABLE', '10000000-0000-4000-8000-000000000003', 'RECEIVABLE_WRITTEN_OFF', -300),
        ('40000000-0000-4000-8000-000000000008', $1, 'RECEIVABLE', '10000000-0000-4000-8000-000000000004', 'RECEIVABLE_CREATED', 400),
        ('40000000-0000-4000-8000-000000000009', $1, 'RECEIVABLE', '10000000-0000-4000-8000-000000000004', 'RECEIVABLE_CANCELLED', -400)`,
      [organizationId, receivableOneId, paymentId, otherOrganizationId],
    );
  });

  afterAll(async () => {
    await testModule?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  it('returns tenant-scoped active-allocation and ledger totals in a stable cursor page', async () => {
    const query = testModule.get(TypeOrmArReconciliationQuery);

    const firstPage = await query.listPage(organizationId, null, 2);

    expect(firstPage.subjects).toEqual([
      {
        organizationId,
        subjectType: LedgerEventSubjectType.RECEIVABLE,
        subjectId: receivableOneId,
        storedRollupAmount: 150,
        currentBalance: 850,
        activeAllocationAmount: 150,
        ledgerMovementAmount: 850,
        hasRolloutBaseline: true,
        hasOpeningEvent: false,
      },
      {
        organizationId,
        subjectType: LedgerEventSubjectType.RECEIVABLE,
        subjectId: receivableTwoId,
        storedRollupAmount: 150,
        currentBalance: 250,
        activeAllocationAmount: 150,
        ledgerMovementAmount: 0,
        hasRolloutBaseline: false,
        hasOpeningEvent: false,
      },
    ]);
    expect(firstPage.nextCursor).toEqual({
      subjectType: LedgerEventSubjectType.RECEIVABLE,
      subjectId: receivableTwoId,
    });

    const secondPage = await query.listPage(
      organizationId,
      firstPage.nextCursor,
      2,
    );

    expect(secondPage.subjects).toEqual([
      {
        organizationId,
        subjectType: LedgerEventSubjectType.RECEIVABLE,
        subjectId: '10000000-0000-4000-8000-000000000003',
        storedRollupAmount: 0,
        currentBalance: 0,
        activeAllocationAmount: 0,
        ledgerMovementAmount: 0,
        hasRolloutBaseline: false,
        hasOpeningEvent: true,
      },
      {
        organizationId,
        subjectType: LedgerEventSubjectType.RECEIVABLE,
        subjectId: '10000000-0000-4000-8000-000000000004',
        storedRollupAmount: 0,
        currentBalance: 0,
        activeAllocationAmount: 0,
        ledgerMovementAmount: 0,
        hasRolloutBaseline: false,
        hasOpeningEvent: true,
      },
    ]);
    expect(secondPage.nextCursor).toEqual({
      subjectType: LedgerEventSubjectType.RECEIVABLE,
      subjectId: '10000000-0000-4000-8000-000000000004',
    });

    const thirdPage = await query.listPage(
      organizationId,
      secondPage.nextCursor,
      2,
    );

    expect(thirdPage.subjects).toEqual([
      {
        organizationId,
        subjectType: LedgerEventSubjectType.PAYMENT,
        subjectId: paymentId,
        storedRollupAmount: 200,
        currentBalance: 400,
        activeAllocationAmount: 300,
        ledgerMovementAmount: 400,
        hasRolloutBaseline: true,
        hasOpeningEvent: false,
      },
    ]);
    expect(thirdPage.nextCursor).toBeNull();
  });
});
