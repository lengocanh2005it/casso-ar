import { randomUUID } from 'node:crypto';
import { ReceivableStatus } from '@casso-ar/shared-types';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { fromZonedTime } from 'date-fns-tz';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ErrorCode } from '../src/common/errors/error-code';
import { TenantContextService } from '../src/common/tenancy/tenant-context';
import { AddReceivableBalanceHistoryRolloutBaseline20260822000000 } from '../src/database/migrations/20260822000000-add-receivable-balance-history-rollout-baseline';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { LedgerEventRecorderService } from '../src/modules/ledger/application/ledger-event-recorder.service';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { AllocatePaymentUseCase } from '../src/modules/payments/application/allocate-payment.usecase';
import { UndoPaymentAllocationUseCase } from '../src/modules/payments/application/undo-payment-allocation.usecase';
import { PaymentOrmEntity } from '../src/modules/payments/infrastructure/payment.orm-entity';
import {
  type IReceivableBalanceHistoryRepository,
  RECEIVABLE_BALANCE_HISTORY_REPOSITORY,
} from '../src/modules/receivable-balance-history/application/receivable-balance-history.repository.port';
import {
  type HistoricalOutstandingPoint,
  type IReceivableBalanceHistoryQuery,
  RECEIVABLE_BALANCE_HISTORY_QUERY,
} from '../src/modules/receivable-balance-history/application/receivable-balance-history-query.port';
import { BalanceHistoryActorType } from '../src/modules/receivable-balance-history/domain/balance-history-actor-type';
import { BalanceHistoryChangeSource } from '../src/modules/receivable-balance-history/domain/balance-history-change-source';
import { BalanceHistoryReasonCode } from '../src/modules/receivable-balance-history/domain/balance-history-reason-code';
import { ReceivableBalanceHistoryOrmEntity } from '../src/modules/receivable-balance-history/infrastructure/receivable-balance-history.orm-entity';
import { CancelReceivableUseCase } from '../src/modules/receivables/application/cancel-receivable.usecase';
import { CreateReceivableUseCase } from '../src/modules/receivables/application/create-receivable.usecase';
import { WriteOffReceivableUseCase } from '../src/modules/receivables/application/write-off-receivable.usecase';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';
import { createTwoPartyStartGate } from './helpers/two-party-start-gate';

const REPORTING_TIMEZONE = 'Asia/Ho_Chi_Minh';
const organizationId = '00000000-0000-4000-8000-000000000151';
const otherOrgId = '00000000-0000-4000-8000-000000000152';
const historyQueryOrgId = '00000000-0000-4000-8000-000000000164';
const userId = '00000000-0000-4000-8000-000000000153';
const customerId = '00000000-0000-4000-8000-000000000154';

function monthEndInTimeZone(year: number, month: number): Date {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const startOfNextMonth = fromZonedTime(
    `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00`,
    REPORTING_TIMEZONE,
  );
  return new Date(startOfNextMonth.getTime() - 1);
}

describe('Receivable balance history (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let redis: StartedTestContainer | undefined;
  let app: INestApplication | undefined;
  let dataSource: DataSource;
  let tenantContext: TenantContextService;
  let createReceivable: CreateReceivableUseCase;
  let cancelReceivable: CancelReceivableUseCase;
  let writeOffReceivable: WriteOffReceivableUseCase;
  let allocatePayment: AllocatePaymentUseCase;
  let undoPaymentAllocation: UndoPaymentAllocationUseCase;
  let ledgerRecorder: LedgerEventRecorderService;
  let historyQuery: IReceivableBalanceHistoryQuery;
  let historyRepo: IReceivableBalanceHistoryRepository;

  async function asTenant<T>(
    orgId: string,
    callback: () => Promise<T>,
  ): Promise<T> {
    return tenantContext.run(
      { userId, organizationId: orgId, role: Role.OWNER },
      callback,
    );
  }

  async function findOutstandingByMonthEnds(
    orgId: string,
    monthEnds: Date[],
  ): Promise<HistoricalOutstandingPoint[]> {
    return asTenant(orgId, () =>
      historyQuery.findOutstandingByMonthEnds(orgId, monthEnds),
    );
  }

  async function historyRows(): Promise<
    Array<{
      receivableId: string;
      status: string;
      remainingAmount: number;
      changeSource: string;
      reasonCode: string | null;
      actorType: string | null;
      actorUserId: string | null;
      note: string | null;
      transitionReferenceId: string | null;
      changeReason: string | null;
      effectiveAt: Date;
    }>
  > {
    const rows = await dataSource.query(
      `SELECT "receivableId", status, "remainingAmount", "changeSource",
              "reasonCode", "actorType", "actorUserId", note,
              "transitionReferenceId", "changeReason", "effectiveAt"
       FROM receivable_balance_history
       WHERE "organizationId" = $1
       ORDER BY "effectiveAt", sequence`,
      [organizationId],
    );
    return rows.map((row: Record<string, unknown>) => ({
      receivableId: String(row.receivableId),
      status: String(row.status),
      remainingAmount: Number(row.remainingAmount),
      changeSource: String(row.changeSource),
      reasonCode: row.reasonCode === null ? null : String(row.reasonCode),
      actorType: row.actorType === null ? null : String(row.actorType),
      actorUserId: row.actorUserId === null ? null : String(row.actorUserId),
      note: row.note === null ? null : String(row.note),
      transitionReferenceId:
        row.transitionReferenceId === null
          ? null
          : String(row.transitionReferenceId),
      changeReason: row.changeReason === null ? null : String(row.changeReason),
      effectiveAt: new Date(String(row.effectiveAt)),
    }));
  }

  async function createPayment(
    orgId: string,
    customer: string,
    totalAmount: number,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.getRepository(PaymentOrmEntity).save({
      id,
      organizationId: orgId,
      customerId: customer,
      bankTransactionId: null,
      totalAmount,
      allocatedAmount: 0,
      payerName: 'History Test Payer',
      receivedAt: new Date(),
      createdAt: new Date(),
    });
    return id;
  }

  beforeAll(async () => {
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
    process.env.JWT_SECRET = 'e2e-jwt-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'e2e-resend-key';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'e2e-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'e2e-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
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
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);
    tenantContext = moduleRef.get(TenantContextService);
    createReceivable = moduleRef.get(CreateReceivableUseCase);
    cancelReceivable = moduleRef.get(CancelReceivableUseCase, {
      strict: false,
    });
    writeOffReceivable = moduleRef.get(WriteOffReceivableUseCase);
    allocatePayment = moduleRef.get(AllocatePaymentUseCase);
    undoPaymentAllocation = moduleRef.get(UndoPaymentAllocationUseCase);
    ledgerRecorder = moduleRef.get(LedgerEventRecorderService);
    historyQuery = moduleRef.get(RECEIVABLE_BALANCE_HISTORY_QUERY);
    historyRepo = moduleRef.get(RECEIVABLE_BALANCE_HISTORY_REPOSITORY);

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'History Owner',
      email: 'history-owner@example.com',
      passwordHash: 'test-hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      organizationId,
      userId,
      role: Role.OWNER,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      organizationId: otherOrgId,
      userId,
      role: Role.OWNER,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'History Customer',
      taxCode: 'HISTORY-001',
      email: 'history-customer@example.com',
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: new Date(),
    });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await Promise.all([redis?.stop(), container?.stop()]);
  }, 60_000);

  describe('write path', () => {
    it('stores receivableId as uuid to match receivables.id', async () => {
      const rows = await dataSource.query(
        `SELECT data_type FROM information_schema.columns
         WHERE table_name = 'receivable_balance_history'
           AND column_name = 'receivableId'`,
      );
      expect(rows[0]?.data_type).toBe('uuid');
    });

    it('records an OPEN create with the full original amount', async () => {
      const receivable = await asTenant(organizationId, () =>
        createReceivable.execute({
          customerId,
          invoiceId: null,
          originalAmount: 10_000_000,
          dueDate: new Date('2026-09-01'),
          salesRepresentativeId: null,
        }),
      );

      const rows = await historyRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        receivableId: receivable.id,
        status: ReceivableStatus.OPEN,
        remainingAmount: 10_000_000,
        changeSource: BalanceHistoryChangeSource.CREATE,
        reasonCode: BalanceHistoryReasonCode.RECEIVABLE_CREATED,
        actorType: BalanceHistoryActorType.USER,
        actorUserId: userId,
        note: null,
        transitionReferenceId: null,
      });
    });

    it('records an allocation with the allocation id as the transition reference', async () => {
      const receivable = await asTenant(organizationId, () =>
        createReceivable.execute({
          customerId,
          invoiceId: null,
          originalAmount: 30_000_000,
          dueDate: new Date('2026-09-01'),
          salesRepresentativeId: null,
        }),
      );
      const paymentId = await createPayment(
        organizationId,
        customerId,
        20_000_000,
      );

      await asTenant(organizationId, () =>
        allocatePayment.execute({
          paymentId,
          receivableId: receivable.id,
          amount: 12_000_000,
          allocatedByUserId: userId,
          provenance: {
            actorType: BalanceHistoryActorType.USER,
            actorUserId: userId,
          },
        }),
      );

      const rows = await historyRows();
      const allocationRow = rows[rows.length - 1];
      expect(allocationRow).toMatchObject({
        receivableId: receivable.id,
        status: ReceivableStatus.PARTIALLY_PAID,
        remainingAmount: 18_000_000,
        changeSource: BalanceHistoryChangeSource.ALLOCATE,
        reasonCode: 'PAYMENT_ALLOCATED',
        actorType: BalanceHistoryActorType.USER,
        actorUserId: userId,
      });
      expect(allocationRow.transitionReferenceId).toBeTruthy();
    });

    it('records a PAID row when an allocation fully pays off the receivable', async () => {
      const receivable = await asTenant(organizationId, () =>
        createReceivable.execute({
          customerId,
          invoiceId: null,
          originalAmount: 5_000_000,
          dueDate: new Date('2026-09-01'),
          salesRepresentativeId: null,
        }),
      );
      const paymentId = await createPayment(
        organizationId,
        customerId,
        5_000_000,
      );

      await asTenant(organizationId, () =>
        allocatePayment.execute({
          paymentId,
          receivableId: receivable.id,
          amount: 5_000_000,
          allocatedByUserId: userId,
          provenance: {
            actorType: BalanceHistoryActorType.USER,
            actorUserId: userId,
          },
        }),
      );

      const rows = await historyRows();
      const paidRow = rows[rows.length - 1];
      expect(paidRow).toMatchObject({
        receivableId: receivable.id,
        status: ReceivableStatus.PAID,
        remainingAmount: 0,
        changeSource: BalanceHistoryChangeSource.ALLOCATE,
      });
    });

    it('reopens a PAID receivable on undo and records an UNDO row', async () => {
      const receivable = await asTenant(organizationId, () =>
        createReceivable.execute({
          customerId,
          invoiceId: null,
          originalAmount: 5_000_000,
          dueDate: new Date('2026-09-01'),
          salesRepresentativeId: null,
        }),
      );
      const paymentId = await createPayment(
        organizationId,
        customerId,
        5_000_000,
      );
      await asTenant(organizationId, () =>
        allocatePayment.execute({
          paymentId,
          receivableId: receivable.id,
          amount: 5_000_000,
          allocatedByUserId: userId,
          provenance: {
            actorType: BalanceHistoryActorType.USER,
            actorUserId: userId,
          },
        }),
      );

      const allocationRow = (
        await dataSource.query(
          `SELECT id FROM payment_allocations
           WHERE "organizationId" = $1 AND "receivableId" = $2
           ORDER BY "createdAt" DESC LIMIT 1`,
          [organizationId, receivable.id],
        )
      )[0] as { id: string };

      await asTenant(organizationId, () =>
        undoPaymentAllocation.execute({
          allocationId: allocationRow.id,
          deletedByUserId: userId,
          undoReason: 'Correction',
        }),
      );

      const rows = await historyRows();
      const undoRow = rows[rows.length - 1];
      expect(undoRow).toMatchObject({
        receivableId: receivable.id,
        status: ReceivableStatus.OPEN,
        remainingAmount: 5_000_000,
        changeSource: BalanceHistoryChangeSource.UNDO,
        reasonCode: 'PAYMENT_ALLOCATION_UNDONE',
        actorType: BalanceHistoryActorType.USER,
        actorUserId: userId,
        transitionReferenceId: allocationRow.id,
        note: 'Correction',
      });
      const reopened = (
        await dataSource.query(
          `SELECT status, "paidAmount" FROM receivables WHERE id = $1`,
          [receivable.id],
        )
      )[0] as { status: string; paidAmount: number };
      expect(reopened.status).toBe(ReceivableStatus.OPEN);
      expect(Number(reopened.paidAmount)).toBe(0);
    });

    it('completes a new allocation and concurrent undo on the same payment and receivable', async () => {
      const receivable = await asTenant(organizationId, () =>
        createReceivable.execute({
          customerId,
          invoiceId: null,
          originalAmount: 50_000_000,
          dueDate: new Date('2026-09-01'),
          salesRepresentativeId: null,
        }),
      );
      const paymentId = await createPayment(
        organizationId,
        customerId,
        50_000_000,
      );
      await asTenant(organizationId, () =>
        allocatePayment.execute({
          paymentId,
          receivableId: receivable.id,
          amount: 10_000_000,
          allocatedByUserId: userId,
          provenance: {
            actorType: BalanceHistoryActorType.USER,
            actorUserId: userId,
          },
        }),
      );

      const [{ id: existingAllocationId }] = (await dataSource.query(
        `SELECT id FROM payment_allocations
         WHERE "organizationId" = $1 AND "paymentId" = $2
           AND "receivableId" = $3 AND "deletedAt" IS NULL`,
        [organizationId, paymentId, receivable.id],
      )) as Array<{ id: string }>;

      const startTogether = createTwoPartyStartGate();

      await Promise.all([
        (async () => {
          await startTogether();
          await asTenant(organizationId, () =>
            allocatePayment.execute({
              paymentId,
              receivableId: receivable.id,
              amount: 15_000_000,
              allocatedByUserId: userId,
              provenance: {
                actorType: BalanceHistoryActorType.USER,
                actorUserId: userId,
              },
            }),
          );
        })(),
        (async () => {
          await startTogether();
          await asTenant(organizationId, () =>
            undoPaymentAllocation.execute({
              allocationId: existingAllocationId,
              deletedByUserId: userId,
              undoReason: 'Concurrent correction',
            }),
          );
        })(),
      ]);

      const savedReceivable = await dataSource
        .getRepository(ReceivableOrmEntity)
        .findOneByOrFail({ id: receivable.id, organizationId });
      const savedPayment = await dataSource
        .getRepository(PaymentOrmEntity)
        .findOneByOrFail({ id: paymentId, organizationId });
      expect(Number(savedReceivable.paidAmount)).toBe(15_000_000);
      expect(Number(savedPayment.allocatedAmount)).toBe(15_000_000);

      const allocations = (await dataSource.query(
        `SELECT "allocatedAmount", "deletedAt" FROM payment_allocations
         WHERE "organizationId" = $1 AND "paymentId" = $2
           AND "receivableId" = $3`,
        [organizationId, paymentId, receivable.id],
      )) as Array<{ allocatedAmount: string; deletedAt: Date | null }>;
      expect(allocations).toHaveLength(2);
      expect(
        allocations.filter((allocation) => allocation.deletedAt === null),
      ).toHaveLength(1);
      expect(
        allocations.filter((allocation) => allocation.deletedAt !== null),
      ).toHaveLength(1);
      expect(
        Number(
          allocations.find((allocation) => allocation.deletedAt === null)
            ?.allocatedAmount,
        ),
      ).toBe(15_000_000);
      expect(
        Number(
          allocations.find((allocation) => allocation.deletedAt !== null)
            ?.allocatedAmount,
        ),
      ).toBe(10_000_000);

      const history = await dataSource
        .getRepository(ReceivableBalanceHistoryOrmEntity)
        .findBy({ organizationId, receivableId: receivable.id });
      expect(history.map((entry) => entry.changeSource).sort()).toEqual([
        BalanceHistoryChangeSource.ALLOCATE,
        BalanceHistoryChangeSource.ALLOCATE,
        BalanceHistoryChangeSource.CREATE,
        BalanceHistoryChangeSource.UNDO,
      ]);
      const allocationLedgerEvents = await dataSource.query(
        `SELECT kind FROM ledger_events
         WHERE "organizationId" = $1 AND "subjectId" IN ($2, $3)
           AND kind IN (
             'RECEIVABLE_ALLOCATED', 'PAYMENT_ALLOCATED',
             'RECEIVABLE_ALLOCATION_UNDONE', 'PAYMENT_ALLOCATION_UNDONE'
           )`,
        [organizationId, receivable.id, paymentId],
      );
      expect(allocationLedgerEvents).toHaveLength(6);
    }, 20_000);

    it('rolls back allocation, rollups, balance history, and ledger writes after an in-transaction failure', async () => {
      const receivable = await asTenant(organizationId, () =>
        createReceivable.execute({
          customerId,
          invoiceId: null,
          originalAmount: 10_000_000,
          dueDate: new Date('2026-09-01'),
          salesRepresentativeId: null,
        }),
      );
      const paymentId = await createPayment(
        organizationId,
        customerId,
        10_000_000,
      );
      const historyBefore = await dataSource
        .getRepository(ReceivableBalanceHistoryOrmEntity)
        .countBy({ organizationId, receivableId: receivable.id });
      const allocationsBefore = (await dataSource.query(
        `SELECT COUNT(*)::int AS count FROM payment_allocations
         WHERE "organizationId" = $1 AND "paymentId" = $2`,
        [organizationId, paymentId],
      )) as Array<{ count: number }>;
      const ledgerBefore = (await dataSource.query(
        `SELECT COUNT(*)::int AS count FROM ledger_events
         WHERE "organizationId" = $1 AND "subjectId" IN ($2, $3)`,
        [organizationId, receivable.id, paymentId],
      )) as Array<{ count: number }>;

      const recordLedgerEvent = ledgerRecorder.record.bind(ledgerRecorder);
      let ledgerWrites = 0;
      const ledgerSpy = jest
        .spyOn(ledgerRecorder, 'record')
        .mockImplementation(async (input) => {
          await recordLedgerEvent(input);
          ledgerWrites += 1;
          if (ledgerWrites === 2) {
            throw new Error('Injected failure after ledger writes');
          }
        });
      try {
        await expect(
          asTenant(organizationId, () =>
            allocatePayment.execute({
              paymentId,
              receivableId: receivable.id,
              amount: 5_000_000,
              allocatedByUserId: userId,
              provenance: {
                actorType: BalanceHistoryActorType.USER,
                actorUserId: userId,
              },
            }),
          ),
        ).rejects.toThrow('Injected failure after ledger writes');
      } finally {
        ledgerSpy.mockRestore();
      }

      expect(ledgerWrites).toBe(2);
      const savedReceivable = await dataSource
        .getRepository(ReceivableOrmEntity)
        .findOneByOrFail({ id: receivable.id, organizationId });
      const savedPayment = await dataSource
        .getRepository(PaymentOrmEntity)
        .findOneByOrFail({ id: paymentId, organizationId });
      expect(Number(savedReceivable.paidAmount)).toBe(0);
      expect(Number(savedPayment.allocatedAmount)).toBe(0);
      expect(
        await dataSource
          .getRepository(ReceivableBalanceHistoryOrmEntity)
          .countBy({ organizationId, receivableId: receivable.id }),
      ).toBe(historyBefore);
      const allocationsAfter = (await dataSource.query(
        `SELECT COUNT(*)::int AS count FROM payment_allocations
         WHERE "organizationId" = $1 AND "paymentId" = $2`,
        [organizationId, paymentId],
      )) as Array<{ count: number }>;
      const ledgerAfter = (await dataSource.query(
        `SELECT COUNT(*)::int AS count FROM ledger_events
         WHERE "organizationId" = $1 AND "subjectId" IN ($2, $3)`,
        [organizationId, receivable.id, paymentId],
      )) as Array<{ count: number }>;
      expect(allocationsAfter[0].count).toBe(allocationsBefore[0].count);
      expect(ledgerAfter[0].count).toBe(ledgerBefore[0].count);
    }, 20_000);

    it('records a CANCELLED row for an unpaid receivable', async () => {
      const receivable = await asTenant(organizationId, () =>
        createReceivable.execute({
          customerId,
          invoiceId: null,
          originalAmount: 8_000_000,
          dueDate: new Date('2026-09-01'),
          salesRepresentativeId: null,
        }),
      );

      await asTenant(organizationId, () =>
        cancelReceivable.execute(receivable.id),
      );

      const rows = await historyRows();
      const cancelRow = rows[rows.length - 1];
      expect(cancelRow).toMatchObject({
        receivableId: receivable.id,
        status: ReceivableStatus.CANCELLED,
        changeSource: BalanceHistoryChangeSource.CANCEL,
        reasonCode: BalanceHistoryReasonCode.RECEIVABLE_CANCELLED,
        actorType: BalanceHistoryActorType.USER,
        actorUserId: userId,
      });
    });

    it('records a WRITTEN_OFF row', async () => {
      const receivable = await asTenant(organizationId, () =>
        createReceivable.execute({
          customerId,
          invoiceId: null,
          originalAmount: 8_000_000,
          dueDate: new Date('2026-09-01'),
          salesRepresentativeId: null,
        }),
      );

      await asTenant(organizationId, () =>
        writeOffReceivable.execute(receivable.id),
      );

      const rows = await historyRows();
      const writeOffRow = rows[rows.length - 1];
      expect(writeOffRow).toMatchObject({
        receivableId: receivable.id,
        status: ReceivableStatus.WRITTEN_OFF,
        changeSource: BalanceHistoryChangeSource.WRITE_OFF,
        reasonCode: 'RECEIVABLE_WRITTEN_OFF',
        actorType: BalanceHistoryActorType.USER,
        actorUserId: userId,
      });
    });

    it('leaves no history row when an allocation fails', async () => {
      const receivable = await asTenant(organizationId, () =>
        createReceivable.execute({
          customerId,
          invoiceId: null,
          originalAmount: 3_000_000,
          dueDate: new Date('2026-09-01'),
          salesRepresentativeId: null,
        }),
      );
      const paymentId = await createPayment(
        organizationId,
        customerId,
        10_000_000,
      );
      const before = await historyRows();

      await expect(
        asTenant(organizationId, () =>
          allocatePayment.execute({
            paymentId,
            receivableId: receivable.id,
            amount: 9_000_000,
            allocatedByUserId: userId,
            provenance: {
              actorType: BalanceHistoryActorType.USER,
              actorUserId: userId,
            },
          }),
        ),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.ALLOCATION_EXCEEDS_REMAINING,
      });

      expect(await historyRows()).toHaveLength(before.length);
    });

    it('keeps another organization invisible to this tenant', async () => {
      const rowsBefore = await historyRows();
      const otherCustomerId = randomUUID();
      await dataSource.getRepository(CustomerOrmEntity).save({
        id: otherCustomerId,
        organizationId: otherOrgId,
        name: 'Other Org Customer',
        taxCode: 'OTHER-001',
        email: 'other-customer@example.com',
        phone: '0900000001',
        defaultPaymentTermDays: 30,
        creditLimit: 10_000_000,
        priority: 1,
        createdAt: new Date(),
      });

      await asTenant(otherOrgId, () =>
        createReceivable.execute({
          customerId: otherCustomerId,
          invoiceId: null,
          originalAmount: 4_000_000,
          dueDate: new Date('2026-09-01'),
          salesRepresentativeId: null,
        }),
      );

      expect(await historyRows()).toHaveLength(rowsBefore.length);
      const otherRows = await dataSource.query(
        `SELECT COUNT(*)::text AS count
         FROM receivable_balance_history WHERE "organizationId" = $1`,
        [otherOrgId],
      );
      expect(Number(otherRows[0]?.count ?? 0)).toBe(1);
    });

    it('is append-only: re-appending an existing id cannot overwrite the row', async () => {
      const id = randomUUID();
      const entry = {
        id,
        organizationId,
        receivableId: randomUUID(),
        status: ReceivableStatus.OPEN,
        remainingAmount: 5_000_000,
        effectiveAt: new Date('2026-08-14T02:00:00.000Z'),
        changeSource: BalanceHistoryChangeSource.CREATE,
        reasonCode: BalanceHistoryReasonCode.RECEIVABLE_CREATED,
        actorType: BalanceHistoryActorType.USER,
        actorUserId: userId,
        note: null,
        transitionReferenceId: null,
        createdAt: new Date('2026-08-14T02:00:00.000Z'),
      };
      await asTenant(organizationId, () => historyRepo.append(entry));

      await expect(
        asTenant(organizationId, () =>
          historyRepo.append({ ...entry, remainingAmount: 9_000_000 }),
        ),
      ).rejects.toThrow();

      const rows = await dataSource.query(
        `SELECT "remainingAmount"::text AS "remainingAmount"
         FROM receivable_balance_history WHERE id = $1`,
        [id],
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0]?.remainingAmount)).toBe(5_000_000);
    });
  });

  describe('month-end outstanding query', () => {
    async function clearHistoryRows(
      coveredFrom = new Date('2026-07-01T00:00:00.000Z'),
    ): Promise<void> {
      await dataSource.query(
        'DELETE FROM receivable_balance_history WHERE "organizationId" = $1',
        [historyQueryOrgId],
      );
      await dataSource.query(
        `INSERT INTO receivable_balance_history_coverage
           ("organizationId", "coveredFrom", "reason")
         VALUES ($1, $2, 'HISTORY_COVERAGE_START')
         ON CONFLICT ("organizationId") DO UPDATE SET
           "coveredFrom" = EXCLUDED."coveredFrom",
           "reason" = EXCLUDED."reason"`,
        [historyQueryOrgId, coveredFrom],
      );
    }

    it('returns null for pre-coverage months and sums the latest open balances', async () => {
      await clearHistoryRows();
      const receivableId = randomUUID();
      await dataSource.getRepository(ReceivableBalanceHistoryOrmEntity).save([
        {
          id: randomUUID(),
          organizationId: historyQueryOrgId,
          receivableId: randomUUID(),
          status: ReceivableStatus.OPEN,
          remainingAmount: 12_000_000,
          effectiveAt: new Date('2026-06-15T02:00:00.000Z'),
          changeSource: BalanceHistoryChangeSource.CREATE,
          reasonCode: BalanceHistoryReasonCode.RECEIVABLE_CREATED,
          actorType: BalanceHistoryActorType.USER,
          actorUserId: userId,
          note: null,
          transitionReferenceId: null,
          createdAt: new Date('2026-06-15T02:00:00.000Z'),
        },
        {
          id: randomUUID(),
          organizationId: historyQueryOrgId,
          receivableId,
          status: ReceivableStatus.OPEN,
          remainingAmount: 10_000_000,
          effectiveAt: new Date('2026-07-10T02:00:00.000Z'),
          changeSource: BalanceHistoryChangeSource.CREATE,
          reasonCode: BalanceHistoryReasonCode.RECEIVABLE_CREATED,
          actorType: BalanceHistoryActorType.USER,
          actorUserId: userId,
          note: null,
          transitionReferenceId: null,
          createdAt: new Date('2026-07-10T02:00:00.000Z'),
        },
        {
          id: randomUUID(),
          organizationId: historyQueryOrgId,
          receivableId,
          status: ReceivableStatus.PARTIALLY_PAID,
          remainingAmount: 6_000_000,
          effectiveAt: new Date('2026-07-25T02:00:00.000Z'),
          changeSource: BalanceHistoryChangeSource.ALLOCATE,
          changeReason: 'alloc-1',
          createdAt: new Date('2026-07-25T02:00:00.000Z'),
        },
        {
          id: randomUUID(),
          organizationId: historyQueryOrgId,
          receivableId,
          status: ReceivableStatus.PAID,
          remainingAmount: 0,
          effectiveAt: new Date('2026-08-05T02:00:00.000Z'),
          changeSource: BalanceHistoryChangeSource.ALLOCATE,
          changeReason: 'alloc-2',
          createdAt: new Date('2026-08-05T02:00:00.000Z'),
        },
        {
          id: randomUUID(),
          organizationId: historyQueryOrgId,
          receivableId,
          status: ReceivableStatus.PARTIALLY_PAID,
          remainingAmount: 2_000_000,
          effectiveAt: new Date('2026-08-15T02:00:00.000Z'),
          changeSource: BalanceHistoryChangeSource.UNDO,
          changeReason: 'alloc-2',
          createdAt: new Date('2026-08-15T02:00:00.000Z'),
        },
      ]);

      const result = await findOutstandingByMonthEnds(historyQueryOrgId, [
        monthEndInTimeZone(2026, 5),
        monthEndInTimeZone(2026, 6),
        monthEndInTimeZone(2026, 7),
        monthEndInTimeZone(2026, 8),
      ]);

      expect(result).toEqual([
        { month: '2026-05', outstanding: null },
        { month: '2026-06', outstanding: null },
        { month: '2026-07', outstanding: 6_000_000 },
        { month: '2026-08', outstanding: 2_000_000 },
      ]);
    });

    it('includes snapshots stored in PostgreSQL microseconds at month end', async () => {
      await clearHistoryRows(new Date('2026-06-01T00:00:00.000Z'));
      const receivableId = randomUUID();
      const historyId = randomUUID();
      const monthEnd = monthEndInTimeZone(2026, 6);

      await dataSource.query(
        `INSERT INTO receivable_balance_history
          ("id", "organizationId", "receivableId", "status", "remainingAmount", "effectiveAt", "changeSource", "changeReason", "createdAt")
         VALUES ($1, $2, $3, 'OPEN', $4, $5::timestamptz, 'CREATE', NULL, $5::timestamptz)`,
        [
          historyId,
          historyQueryOrgId,
          receivableId,
          1_000_000,
          '2026-06-30T16:59:59.999999Z',
        ],
      );

      await expect(
        findOutstandingByMonthEnds(historyQueryOrgId, [monthEnd]),
      ).resolves.toEqual([{ month: '2026-06', outstanding: 1_000_000 }]);
    });

    it('returns zero, not null, for a covered month with no open balances', async () => {
      await clearHistoryRows();
      const receivableId = randomUUID();
      await dataSource.getRepository(ReceivableBalanceHistoryOrmEntity).save([
        {
          id: randomUUID(),
          organizationId: historyQueryOrgId,
          receivableId,
          status: ReceivableStatus.OPEN,
          remainingAmount: 9_000_000,
          effectiveAt: new Date('2026-09-02T02:00:00.000Z'),
          changeSource: BalanceHistoryChangeSource.CREATE,
          reasonCode: BalanceHistoryReasonCode.RECEIVABLE_CREATED,
          actorType: BalanceHistoryActorType.USER,
          actorUserId: userId,
          note: null,
          transitionReferenceId: null,
          createdAt: new Date('2026-09-02T02:00:00.000Z'),
        },
        {
          id: randomUUID(),
          organizationId: historyQueryOrgId,
          receivableId,
          status: ReceivableStatus.PAID,
          remainingAmount: 0,
          effectiveAt: new Date('2026-09-10T02:00:00.000Z'),
          changeSource: BalanceHistoryChangeSource.ALLOCATE,
          changeReason: 'alloc-3',
          createdAt: new Date('2026-09-10T02:00:00.000Z'),
        },
      ]);

      const result = await findOutstandingByMonthEnds(historyQueryOrgId, [
        monthEndInTimeZone(2026, 9),
      ]);

      expect(result).toEqual([{ month: '2026-09', outstanding: 0 }]);
    });

    it('sums across multiple receivables and ignores terminal latest states', async () => {
      await clearHistoryRows();
      const openId = randomUUID();
      const cancelledId = randomUUID();
      await dataSource.getRepository(ReceivableBalanceHistoryOrmEntity).save([
        {
          id: randomUUID(),
          organizationId: historyQueryOrgId,
          receivableId: openId,
          status: ReceivableStatus.OPEN,
          remainingAmount: 7_000_000,
          effectiveAt: new Date('2026-10-03T02:00:00.000Z'),
          changeSource: BalanceHistoryChangeSource.CREATE,
          reasonCode: BalanceHistoryReasonCode.RECEIVABLE_CREATED,
          actorType: BalanceHistoryActorType.USER,
          actorUserId: userId,
          note: null,
          transitionReferenceId: null,
          createdAt: new Date('2026-10-03T02:00:00.000Z'),
        },
        {
          id: randomUUID(),
          organizationId: historyQueryOrgId,
          receivableId: cancelledId,
          status: ReceivableStatus.OPEN,
          remainingAmount: 5_000_000,
          effectiveAt: new Date('2026-10-04T02:00:00.000Z'),
          changeSource: BalanceHistoryChangeSource.CREATE,
          reasonCode: BalanceHistoryReasonCode.RECEIVABLE_CREATED,
          actorType: BalanceHistoryActorType.USER,
          actorUserId: userId,
          note: null,
          transitionReferenceId: null,
          createdAt: new Date('2026-10-04T02:00:00.000Z'),
        },
        {
          id: randomUUID(),
          organizationId: historyQueryOrgId,
          receivableId: cancelledId,
          status: ReceivableStatus.CANCELLED,
          remainingAmount: 5_000_000,
          effectiveAt: new Date('2026-10-20T02:00:00.000Z'),
          changeSource: BalanceHistoryChangeSource.CANCEL,
          reasonCode: BalanceHistoryReasonCode.RECEIVABLE_CANCELLED,
          actorType: BalanceHistoryActorType.USER,
          actorUserId: userId,
          note: null,
          transitionReferenceId: null,
          createdAt: new Date('2026-10-20T02:00:00.000Z'),
        },
      ]);

      const result = await findOutstandingByMonthEnds(historyQueryOrgId, [
        monthEndInTimeZone(2026, 10),
      ]);

      expect(result).toEqual([{ month: '2026-10', outstanding: 7_000_000 }]);
    });
  });

  it('creates one rollout baseline snapshot per existing receivable and is idempotent', async () => {
    const baselineReceivables = [
      {
        status: ReceivableStatus.DRAFT,
        originalAmount: 1_000_000,
        paidAmount: 0,
      },
      {
        status: ReceivableStatus.OPEN,
        originalAmount: 2_000_000,
        paidAmount: 0,
      },
      {
        status: ReceivableStatus.PARTIALLY_PAID,
        originalAmount: 7_000_000,
        paidAmount: 2_000_000,
      },
      {
        status: ReceivableStatus.PAID,
        originalAmount: 4_000_000,
        paidAmount: 4_000_000,
      },
      {
        status: ReceivableStatus.WRITTEN_OFF,
        originalAmount: 5_000_000,
        paidAmount: 1_000_000,
      },
      {
        status: ReceivableStatus.CANCELLED,
        originalAmount: 6_000_000,
        paidAmount: 0,
      },
    ].map(({ status, originalAmount, paidAmount }) => ({
      id: randomUUID(),
      organizationId: otherOrgId,
      customerId,
      invoiceId: null,
      originalAmount,
      paidAmount,
      dueDate: new Date('2026-09-01'),
      status,
      salesRepresentativeId: null,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      closedAt: status === ReceivableStatus.PAID ? new Date() : null,
      version: 1,
    }));
    await dataSource
      .getRepository(ReceivableOrmEntity)
      .save(baselineReceivables);

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();
      await new AddReceivableBalanceHistoryRolloutBaseline20260822000000().up(
        queryRunner,
      );
      await queryRunner.commitTransaction();

      await queryRunner.startTransaction();
      try {
        await new AddReceivableBalanceHistoryRolloutBaseline20260822000000().up(
          queryRunner,
        );
        await queryRunner.commitTransaction();
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      }
    } finally {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      await queryRunner.release();
    }

    const rows = await dataSource.query(
      `SELECT status, "remainingAmount", "changeSource", "changeReason",
              "actorType", "reasonCode"
       FROM receivable_balance_history
       WHERE "receivableId" = ANY($1::uuid[])
         AND "changeSource" = 'ROLLOUT_BASELINE'`,
      [baselineReceivables.map(({ id }) => id)],
    );

    expect(rows).toHaveLength(baselineReceivables.length);
    expect(rows).toEqual(
      expect.arrayContaining(
        baselineReceivables.map(({ status, originalAmount, paidAmount }) => ({
          status,
          // pg's bigint type parser is registered process-wide (see
          // typeorm.config.ts), so raw reads of bigint money columns return
          // integers, not strings.
          remainingAmount: originalAmount - paidAmount,
          changeSource: 'ROLLOUT_BASELINE',
          changeReason: 'HISTORY_COVERAGE_START',
          actorType: null,
          reasonCode: null,
        })),
      ),
    );

    const coverageRows = await dataSource.query(
      `SELECT "reason"
       FROM receivable_balance_history_coverage
       WHERE "organizationId" = $1`,
      [otherOrgId],
    );
    expect(coverageRows).toEqual([{ reason: 'HISTORY_COVERAGE_START' }]);
  });

  it('rolls back the complete baseline when the cutover transaction fails', async () => {
    const receivableId = randomUUID();
    await dataSource.getRepository(ReceivableOrmEntity).save({
      id: receivableId,
      organizationId: otherOrgId,
      customerId,
      invoiceId: null,
      originalAmount: 8_000_000,
      paidAmount: 3_000_000,
      dueDate: new Date('2026-09-01'),
      status: ReceivableStatus.PARTIALLY_PAID,
      salesRepresentativeId: null,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      closedAt: null,
      version: 1,
    });

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();
      await new AddReceivableBalanceHistoryRolloutBaseline20260822000000().up(
        queryRunner,
      );
      await expect(
        queryRunner.query(
          'SELECT "missing_column" FROM "receivable_balance_history"',
        ),
      ).rejects.toThrow();
      await queryRunner.rollbackTransaction();
    } finally {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      await queryRunner.release();
    }

    const rows = await dataSource.query(
      `SELECT 1
       FROM receivable_balance_history
       WHERE "organizationId" = $1 AND "receivableId" = $2
         AND "changeSource" = 'ROLLOUT_BASELINE'`,
      [otherOrgId, receivableId],
    );

    expect(rows).toEqual([]);
  });
});
