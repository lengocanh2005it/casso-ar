import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import type { StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { TenantContextService } from '../src/common/tenancy/tenant-context';
import { configureApp } from '../src/configure-app';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';
import { MatchingEngineService } from '../src/modules/webhooks/application/matching-engine.service';
import { ProcessWebhookUseCase } from '../src/modules/webhooks/application/process-webhook.usecase';
import { normalizeBalanceHookPayload } from '../src/modules/webhooks/application/transaction-normalizer';
import { BankTransactionOrmEntity } from '../src/modules/webhooks/infrastructure/bank-transaction.orm-entity';
import { MatchingCandidateOrmEntity } from '../src/modules/webhooks/infrastructure/matching-candidate.orm-entity';
import { WebhookInboxOrmEntity } from '../src/modules/webhooks/infrastructure/webhook-inbox.orm-entity';
import {
  loadReplayCases,
  type ReplayCase,
  seedReplayCase,
  toCassoRawPayload,
} from './helpers/matching-fixtures';
import { startTestRedis } from './helpers/test-redis';

// process-webhook.usecase.ts: EXCEPTION_QUEUE_THRESHOLD (module-local there)
const EXCEPTION_QUEUE_THRESHOLD = 60;

// scoreCandidates sorts on totalScore alone, with no tie-break, so two
// candidates on the same score have no defined order. Group by score and
// compare the members of each group as a set: pinning an order here would be
// asserting an accident of query order, and adding a tie-break would change
// which candidate auto-matches.
function byScoreBucket(candidates: { key: string; totalScore: number }[]) {
  const buckets = new Map<number, string[]>();
  for (const candidate of candidates) {
    const keys = buckets.get(candidate.totalScore) ?? [];
    keys.push(candidate.key);
    buckets.set(candidate.totalScore, keys);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => right - left)
    .map(([score, keys]) => ({ score, keys: [...keys].sort() }));
}

describe('Matching replay corpus (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  const organizationId = '00000000-0000-4000-8000-000000000701';
  const userId = '00000000-0000-4000-8000-000000000702';

  beforeAll(async () => {
    redis = await startTestRedis();
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.JWT_SECRET = 'matching-replay-e2e-secret';
    process.env.RESEND_API_KEY = 'matching-replay-e2e-resend-key';

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
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Matching Replay User',
      email: 'matching-replay@example.com',
      passwordHash: 'test-hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      id: randomUUID(),
      organizationId,
      userId,
      role: Role.OWNER,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });

    token = moduleRef.get(JwtService).sign({
      userId,
      organizationId,
      role: Role.OWNER,
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await Promise.all([redis.stop(), container.stop()]);
  });

  async function runCase(replayCase: ReplayCase): Promise<void> {
    const seeded = await seedReplayCase(dataSource, replayCase, organizationId);
    const keyByReceivableId = new Map(
      [...seeded.receivables].map(([key, id]) => [id, key] as const),
    );
    const rawPayload = toCassoRawPayload(replayCase);
    const inboxId = randomUUID();
    await dataSource.getRepository(WebhookInboxOrmEntity).save({
      id: inboxId,
      organizationId,
      bankConnectionId: randomUUID(),
      providerTransactionId: replayCase.webhook.providerTransactionId,
      rawPayload,
      receivedAt: new Date(),
      status: 'RECEIVED',
      processedAt: null,
      errorMessage: null,
      retryCount: 0,
    });

    // Layer 1 — candidate recall and ranking, straight from the engine. Cases
    // only assert their own receivables, so a row another case seeded can
    // never make one of them fail.
    const scored = await app
      .get(TenantContextService)
      .run({ userId: 'system', organizationId, role: Role.OWNER }, () =>
        app
          .get(MatchingEngineService, { strict: false })
          .scoreCandidates(
            normalizeBalanceHookPayload(rawPayload),
            organizationId,
          ),
      );
    const own = scored
      .filter((candidate) => keyByReceivableId.has(candidate.receivableId))
      .map((candidate) => ({
        key: keyByReceivableId.get(candidate.receivableId) as string,
        totalScore: candidate.totalScore,
      }));
    expect(byScoreBucket(own)).toEqual(
      byScoreBucket(replayCase.expect.candidates),
    );

    // Layer 2 — the same transfer end to end: stored status, the candidates
    // that survived into matching_candidates, and the Exception Queue read.
    await app
      .get(ProcessWebhookUseCase, { strict: false })
      .execute(inboxId, organizationId);

    const transaction = await dataSource
      .getRepository(BankTransactionOrmEntity)
      .findOneByOrFail({
        organizationId,
        providerTransactionId: replayCase.webhook.providerTransactionId,
      });
    expect(transaction.status).toBe(replayCase.expect.finalStatus);

    const persisted = await dataSource
      .getRepository(MatchingCandidateOrmEntity)
      .find({ where: { bankTransactionId: transaction.id } });
    // Cases share one organization, so the org-wide scan hands the engine rows
    // seeded by earlier cases too. Those earn a near-match score and are stored
    // on purpose — a reviewer should see plausible receivables, not only the
    // high scorers — so this case's expectation covers its own rows only.
    expect(
      persisted
        .filter((row) => keyByReceivableId.has(row.receivableId))
        .map((row) => keyByReceivableId.get(row.receivableId))
        .sort(),
    ).toEqual([...replayCase.expect.persistedCandidateKeys].sort());

    // What must never appear is a foreign row that could compete for the
    // transfer: the 60 threshold is what decides the transaction's fate, so
    // anything at or above it has to belong to this case. Comparing the whole
    // array instead would pass vacuously — jest's toEqual ignores `undefined`,
    // so an unmapped foreign receivable drops out of the list silently.
    expect(
      persisted
        .filter(
          (row) =>
            !keyByReceivableId.has(row.receivableId) &&
            row.totalScore >= EXCEPTION_QUEUE_THRESHOLD,
        )
        .map((row) => `foreign ${row.receivableId} scored ${row.totalScore}`),
    ).toEqual([]);

    const queue = await request(app.getHttpServer())
      .get('/api/v1/bank-transactions/unmatched?limit=100')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const queued = queue.body.items.find(
      (entry: { transaction: { id: string } }) =>
        entry.transaction.id === transaction.id,
    );
    const actionable =
      replayCase.expect.finalStatus === 'PENDING_REVIEW' ||
      replayCase.expect.finalStatus === 'UNMATCHED';
    // A settled transfer is received money that has already been dealt with;
    // leaving it in the review queue is how received money gets allocated twice.
    if (!actionable) {
      expect(queued).toBeUndefined();
      return;
    }
    expect(queued).toBeDefined();
    expect(queued.transaction.status).toBe(replayCase.expect.finalStatus);
    // UNMATCHED stores no candidate, so the reviewer has nothing suggested;
    // PENDING_REVIEW always keeps the scored set for the reviewer to pick from.
    expect(queued.topCandidate === null).toBe(
      replayCase.expect.finalStatus === 'UNMATCHED',
    );
  }

  for (const replayCase of loadReplayCases()) {
    it(replayCase.name, async () => {
      await runCase(replayCase);
    });
  }
});
