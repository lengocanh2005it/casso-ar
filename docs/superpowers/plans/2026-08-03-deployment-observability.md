# Deployment & Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **2026-08-10 rescoping note (grilling session):** unlike Plan #22, this plan's scope is still almost entirely greenfield — no `observability/` module, no Dockerfiles, no `prom-client` dependency exist yet, and `docker-compose.yml` is still exactly the 2-service (`postgres`/`redis`) base this plan assumes. Four real discrepancies against the current codebase were found and resolved before implementation:
>
> 1. **`TenantContextInterceptor` (shipped by the Multi-tenancy/RBAC plan, after this plan was drafted) already generates its own `requestId`** per authenticated HTTP request and stores it on `AuthenticatedUser.requestId` — already load-bearing (`invoice-import`'s audit-log fingerprinting reads it). Task 1's `RequestIdMiddleware`/`RequestIdStore` is still needed (unauthenticated paths like `/health`/webhook ingestion/BullMQ jobs never populate `TenantContextService`), but it must be the **single source of truth** — `TenantContextInterceptor` is now also modified (additive, out of this plan's original file list) to read from `RequestIdStore` instead of independently minting a second ID with its own `randomUUID()` call. See Task 1's updated Step 5/6.
> 2. **`WebhookProcessor` already has an `onFailed` handler** (dead-letter-queue logging, added by the Webhook Ingestion plan). Task 6's original "Replace it with" full-file sample would have deleted it. Rewritten below as a merge into the existing method body.
> 3. **`EmailQueueProcessor` has evolved past a single-job-type shape** — it now branches on `job.name` ('send-auth-email' vs reminder email) in both `process()` and `onFailed()`, added by the Reminder Automation plan. Task 6's sample assumed one branch; rewritten below to show the real current file and where the metric increment goes in each branch.
> 4. **`HealthController` calling `DataSource`/`Queue` directly, with no use-case layer, was confirmed as a deliberate exception** to `.claude/rules/api.md`'s "controller only calls use case" rule — `/health` (like `/metrics`) is a cross-cutting `common/` system-status endpoint, not a business-domain module under `modules/`, so the rule (aimed at business logic leaking into controllers) doesn't apply. No change from the plan's original Task 5 sample; documented here so it isn't mistaken for an oversight later.
>
> Task 5's `main.ts` change (`bufferLogs: true` + `app.useLogger(...)`) was confirmed to still apply cleanly — no existing logger wiring to conflict with.

**Goal:** Wire up the MVP observability slice — `GET /health` (Docker healthcheck + LB probe), structured JSON logs to stdout with per-request `requestId` correlation, a `/metrics` Prometheus endpoint, and Dockerfiles for `apps/backend`/`apps/frontend` — then extend the Domain Core plan's `docker-compose.yml` (currently `postgres` + `redis` only) to the full 4-service compose the spec requires.

**Architecture:** All observability code lives in one `apps/backend/src/common/observability/` module (`ObservabilityModule`, marked `@Global` so `JsonLogger` and `MetricsService` are injectable anywhere without re-importing). Health check is a **plain custom controller**, not `@nestjs/terminus`: there are exactly 3 known dependencies to probe (Postgres, Redis, BullMQ) and terminus's `HealthIndicator` abstraction exists to make N heterogeneous checks pluggable — with N fixed at 3 and never growing without a spec change, a ~30-line controller is less code and one fewer dependency than wiring terminus's indicator classes. Logging is a **custom `LoggerService` implementation** (`JsonLogger`), not `nestjs-pino`: pino's value is transport plumbing (multiple destinations, log rotation, worker-thread serialization) which this MVP explicitly doesn't need (spec section 2: stdout only, Docker log driver collects it) — a class that JSON-stringifies to `process.stdout.write` satisfies the exact required field list with zero new runtime dependencies. `requestId` is generated in a small `RequestIdMiddleware` and stored in its own `AsyncLocalStorage` (kept separate from the existing `TenantContextService` ALS from the Multi-tenancy plan, because `requestId` exists on every request — including unauthenticated ones like `/health` and the webhook endpoint's queue-processing path — while `TenantContextService`'s store is only populated post-JWT-auth); `JsonLogger` reads both stores and merges whatever is present.

**Tech Stack:** `prom-client` (Prometheus metrics), Node `AsyncLocalStorage` (request correlation, same pattern as `TenantContextService`), multi-stage Docker builds (`node:20-alpine` for backend, `node:20-alpine` + `nginx:alpine` for frontend), Docker Compose.

## Global Constraints

- No `@nestjs/terminus`, no `nestjs-pino` — justified above; do not introduce either without revisiting this decision.
- Every log line is a single JSON object on stdout with at minimum `timestamp, level, message, context`; `requestId` is always present when logged inside an HTTP request or a BullMQ job; `organizationId`/`userId` are present only when `TenantContextService` has a populated store (spec section 2 says "if present").
- `/health` returns `200` with `{ status: 'ok', checks: {...} }` when all three checks pass, `503` with `{ status: 'degraded', checks: {...} }` otherwise — never throws an unhandled error for a down dependency (deployment spec section 1).
- `/metrics` must never require auth (Prometheus scraper has no JWT) and must never be tenant-scoped (it is process-wide, not per-organization).
- `docker-compose.yml` Modify in Task 5 must be an additive diff on top of the Domain Core plan's Task 5 output — `postgres`/`redis` service definitions are unchanged, only `backend` and `frontend` services (plus their `depends_on`) are added.
- Reuse the existing queue constants: `WEBHOOK_PROCESSING_QUEUE` (`'webhook-processing'`) and `EMAIL_QUEUE` (`'email-queue'`, defined in `apps/backend/src/modules/notifications/infrastructure/email-queue.constants.ts`). Metrics must expose backlog/failure labels for both queues; do not invent a third queue name.

---

## File Structure

```
apps/backend/
  Dockerfile                                          -- Create: multi-stage Node 20 build
  src/
    common/
      observability/
        request-id.store.ts                           -- AsyncLocalStorage<string> wrapper
        request-id.middleware.ts                       -- generates/reads x-request-id, populates the store
        json-logger.service.ts                         -- LoggerService implementation, JSON to stdout
        metrics.service.ts                             -- prom-client registry + histograms/counter/gauge
        health.controller.ts                           -- GET /health
        metrics.controller.ts                          -- GET /metrics
        observability.module.ts                        -- @Global, wires the above + RequestIdMiddleware
      tenancy/tenant-context.interceptor.ts             -- MODIFY (2026-08-10 addition): read requestId from RequestIdStore instead of minting its own
    modules/webhooks/infrastructure/webhook.processor.ts  -- MODIFY: record webhook_processing_duration_seconds, bullmq_job_failed_total (merge into existing onFailed)
    modules/notifications/infrastructure/email-queue.processor.ts -- MODIFY: record bullmq_job_failed_total for email-queue (merge into both onFailed branches)
    app.module.ts                                       -- MODIFY: import ObservabilityModule, useLogger(JsonLogger)
    main.ts                                              -- MODIFY: app.useLogger(app.get(JsonLogger))
  test/
    health-and-metrics.e2e-spec.ts                       -- Create: supertest e2e for /health + /metrics
apps/frontend/
  Dockerfile                                             -- Create: multi-stage Vite build -> nginx serve
  nginx.conf                                              -- Create: SPA fallback + gzip
docker-compose.yml                                        -- MODIFY: add backend + frontend services
```

---

### Task 1: Request-scoped `requestId` (AsyncLocalStorage + middleware)

**Files:**
- Create: `apps/backend/src/common/observability/request-id.store.ts`
- Create: `apps/backend/src/common/observability/request-id.middleware.ts`
- Test: `apps/backend/src/common/observability/request-id.store.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `RequestIdStore.getRequestId(): string | undefined`, used by Task 2 (`JsonLogger`)

- [ ] **Step 1: Write failing unit test for `RequestIdStore`**

Create `apps/backend/src/common/observability/request-id.store.spec.ts`:

```typescript
import { RequestIdStore } from './request-id.store';

describe('RequestIdStore', () => {
  it('returns undefined outside of a run() scope', () => {
    const store = new RequestIdStore();
    expect(store.getRequestId()).toBeUndefined();
  });

  it('returns the requestId inside a run() scope', () => {
    const store = new RequestIdStore();
    store.run('req-123', () => {
      expect(store.getRequestId()).toBe('req-123');
    });
  });

  it('isolates concurrent scopes from each other', async () => {
    const store = new RequestIdStore();
    const results: string[] = [];

    await Promise.all([
      new Promise<void>((resolve) =>
        store.run('req-a', () => {
          setTimeout(() => {
            results.push(store.getRequestId()!);
            resolve();
          }, 10);
        }),
      ),
      new Promise<void>((resolve) =>
        store.run('req-b', () => {
          setTimeout(() => {
            results.push(store.getRequestId()!);
            resolve();
          }, 5);
        }),
      ),
    ]);

    expect(results.sort()).toEqual(['req-a', 'req-b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test request-id.store.spec.ts`
Expected: FAIL — Cannot find module `./request-id.store`

- [ ] **Step 3: Create `apps/backend/src/common/observability/request-id.store.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable()
export class RequestIdStore {
  private readonly storage = new AsyncLocalStorage<string>();

  run<T>(requestId: string, callback: () => T): T {
    return this.storage.run(requestId, callback);
  }

  getRequestId(): string | undefined {
    return this.storage.getStore();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test request-id.store.spec.ts`
Expected: all 3 PASS

- [ ] **Step 5: Create `apps/backend/src/common/observability/request-id.middleware.ts`**

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { RequestIdStore } from './request-id.store';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly requestIdStore: RequestIdStore) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
    res.setHeader('x-request-id', requestId);
    this.requestIdStore.run(requestId, () => next());
  }
}
```

`x-request-id` is honored if a reverse proxy already set one (open question from spec section 6 — resolved in favor of "use it if present, generate if not," which is the standard pattern and requires no extra config).

- [ ] **Step 6 (2026-08-10 addition): Modify `apps/backend/src/common/tenancy/tenant-context.interceptor.ts` to read from `RequestIdStore` instead of minting its own**

The current file (shipped by the Multi-tenancy/RBAC plan, after this plan was originally drafted) independently generates a second `requestId` for every authenticated request:

```typescript
// current (before this change):
const requestId = request.header('X-Request-Id')?.trim() || randomUUID();
const contextualUser = { ...user, requestId };
```

By the time `TenantContextInterceptor` runs, `RequestIdMiddleware` (Step 5 above) has already run — Nest applies middleware before guards/interceptors — so `RequestIdStore` already holds the one true `requestId` for this request. Replace the two lines above with:

```typescript
const requestId = this.requestIdStore.getRequestId();
const contextualUser = { ...user, requestId };
```

and inject `RequestIdStore` into the constructor:

```typescript
constructor(
  private readonly tenantContext: TenantContextService,
  private readonly requestIdStore: RequestIdStore,
) {}
```

Drop the now-unused `randomUUID` import. `RequestIdStore` is available here because `ObservabilityModule` (Task 5) is `@Global`, so no explicit import wiring is needed in `TenancyModule`. This keeps `AuthenticatedUser.requestId` (already consumed by `invoice-import`'s audit-log fingerprinting) identical to what `JsonLogger` logs and what `RequestIdMiddleware` sets on the response header — one `requestId` per request, not two.

Update `apps/backend/src/common/tenancy/tenant-context.interceptor.spec.ts` accordingly: construct `TenantContextInterceptor` with a `RequestIdStore` double (`{ getRequestId: () => 'req-test-1' }`) and assert the contextual user's `requestId` matches it, rather than asserting a `randomUUID()`-shaped string.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/common/observability/request-id.store.ts apps/backend/src/common/observability/request-id.middleware.ts apps/backend/src/common/observability/request-id.store.spec.ts apps/backend/src/common/tenancy/tenant-context.interceptor.ts apps/backend/src/common/tenancy/tenant-context.interceptor.spec.ts
git commit -m "feat: add per-request requestId store and middleware, unify with TenantContextInterceptor"
```

---

### Task 2: `JsonLogger` — structured JSON logging to stdout

**Files:**
- Create: `apps/backend/src/common/observability/json-logger.service.ts`
- Test: `apps/backend/src/common/observability/json-logger.service.spec.ts`

**Interfaces:**
- Consumes: `RequestIdStore` (Task 1), `TenantContextService` (Multi-tenancy plan, optional — logger must not throw when it is not in an authenticated scope)
- Produces: `JsonLogger` (implements Nest's `LoggerService`), used by Task 5 (`main.ts` `app.useLogger`)

- [ ] **Step 1: Write failing unit test for `JsonLogger`**

Create `apps/backend/src/common/observability/json-logger.service.spec.ts`:

```typescript
import { JsonLogger } from './json-logger.service';
import { RequestIdStore } from './request-id.store';
import { TenantContextService } from '../tenancy/tenant-context';

describe('JsonLogger', () => {
  let requestIdStore: RequestIdStore;
  let tenantContext: TenantContextService;
  let logger: JsonLogger;
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    requestIdStore = new RequestIdStore();
    tenantContext = new TenantContextService();
    logger = new JsonLogger(requestIdStore, tenantContext);
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('writes a JSON line with timestamp, level, message, context', () => {
    logger.log('hello world', 'TestContext');

    const written = JSON.parse(writeSpy.mock.calls[0][0] as string);
    expect(written.level).toBe('log');
    expect(written.message).toBe('hello world');
    expect(written.context).toBe('TestContext');
    expect(typeof written.timestamp).toBe('string');
    expect(written.organizationId).toBeUndefined();
    expect(written.userId).toBeUndefined();
  });

  it('includes requestId when inside a RequestIdStore scope', () => {
    requestIdStore.run('req-999', () => {
      logger.log('scoped message', 'TestContext');
    });

    const written = JSON.parse(writeSpy.mock.calls[0][0] as string);
    expect(written.requestId).toBe('req-999');
  });

  it('includes organizationId and userId when inside an authenticated TenantContextService scope', () => {
    tenantContext.run({ userId: 'user-1', organizationId: 'org-1', role: 'ADMIN' as any }, () => {
      logger.error('boom', undefined, 'TestContext');
    });

    const written = JSON.parse(writeSpy.mock.calls[0][0] as string);
    expect(written.level).toBe('error');
    expect(written.organizationId).toBe('org-1');
    expect(written.userId).toBe('user-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test json-logger.service.spec.ts`
Expected: FAIL — Cannot find module `./json-logger.service`

- [ ] **Step 3: Create `apps/backend/src/common/observability/json-logger.service.ts`**

```typescript
import { Injectable, LoggerService, LogLevel } from '@nestjs/common';
import { RequestIdStore } from './request-id.store';
import { TenantContextService } from '../tenancy/tenant-context';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  requestId?: string;
  organizationId?: string;
  userId?: string;
  trace?: string;
}

@Injectable()
export class JsonLogger implements LoggerService {
  constructor(
    private readonly requestIdStore: RequestIdStore,
    private readonly tenantContext: TenantContextService,
  ) {}

  log(message: string, context?: string): void {
    this.write('log', message, context);
  }

  error(message: string, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }

  warn(message: string, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: string, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: string, context?: string): void {
    this.write('verbose', message, context);
  }

  private write(level: LogLevel, message: string, context?: string, trace?: string): void {
    const user = this.tenantContext.getCurrentUser();
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      requestId: this.requestIdStore.getRequestId(),
      organizationId: user?.organizationId,
      userId: user?.userId,
      trace,
    };
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test json-logger.service.spec.ts`
Expected: all 3 PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/common/observability/json-logger.service.ts apps/backend/src/common/observability/json-logger.service.spec.ts
git commit -m "feat: add JsonLogger structured logging to stdout"
```

---

### Task 3: `MetricsService` — Prometheus metrics via `prom-client`

**Files:**
- Create: `apps/backend/src/common/observability/metrics.service.ts`
- Create: `apps/backend/src/common/observability/metrics.controller.ts`
- Test: `apps/backend/src/common/observability/metrics.service.spec.ts`

**Interfaces:**
- Consumes: `WEBHOOK_PROCESSING_QUEUE` and `EMAIL_QUEUE` constants + injected BullMQ queues (Webhook Ingestion and Email Notification plans, `@InjectQueue`)
- Produces: `MetricsService.observeHttpRequest(...)`, `.observeWebhookProcessing(...)`, `.incrementBullmqJobFailed(...)`, `.getMetricsText()`, used by Task 4 (HTTP interceptor), Task 6 (`WebhookProcessor` + `EmailQueueProcessor` modifications), and `GET /metrics`

- [ ] **Step 1: Install `prom-client`**

Run: `pnpm --filter @casso-ledger/backend add prom-client`

- [ ] **Step 2: Write failing unit test for `MetricsService`**

Create `apps/backend/src/common/observability/metrics.service.spec.ts`:

```typescript
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let metrics: MetricsService;
  let fakeWebhookQueue: { getWaitingCount: jest.Mock; getActiveCount: jest.Mock };
  let fakeEmailQueue: { getWaitingCount: jest.Mock; getActiveCount: jest.Mock };

  beforeEach(() => {
    fakeWebhookQueue = {
      getWaitingCount: jest.fn().mockResolvedValue(3),
      getActiveCount: jest.fn().mockResolvedValue(1),
    };
    fakeEmailQueue = {
      getWaitingCount: jest.fn().mockResolvedValue(2),
      getActiveCount: jest.fn().mockResolvedValue(1),
    };
    metrics = new MetricsService(fakeWebhookQueue as any, fakeEmailQueue as any);
  });

  it('exposes http_request_duration_seconds after an observation', async () => {
    metrics.observeHttpRequest('GET', '/health', 200, 0.05);
    const text = await metrics.getMetricsText();
    expect(text).toContain('# HELP http_request_duration_seconds');
    expect(text).toContain('http_request_duration_seconds_bucket');
  });

  it('exposes webhook_processing_duration_seconds after an observation', async () => {
    metrics.observeWebhookProcessing(1.2);
    const text = await metrics.getMetricsText();
    expect(text).toContain('# HELP webhook_processing_duration_seconds');
  });

  it('exposes bullmq_job_failed_total incremented per queue', async () => {
    metrics.incrementBullmqJobFailed('webhook-processing');
    metrics.incrementBullmqJobFailed('email-queue');
    const text = await metrics.getMetricsText();
    expect(text).toContain('bullmq_job_failed_total{queue="webhook-processing"} 1');
    expect(text).toContain('bullmq_job_failed_total{queue="email-queue"} 1');
  });

  it('exposes bullmq_queue_backlog_size computed from the queue at scrape time', async () => {
    const text = await metrics.getMetricsText();
    expect(text).toContain('# HELP bullmq_queue_backlog_size');
    expect(text).toContain('bullmq_queue_backlog_size{queue="webhook-processing"} 4');
    expect(text).toContain('bullmq_queue_backlog_size{queue="email-queue"} 3');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test metrics.service.spec.ts`
Expected: FAIL — Cannot find module `./metrics.service`

- [ ] **Step 4: Create `apps/backend/src/common/observability/metrics.service.ts`**

`prom-client`'s constructor-time `collect` option is called with the `Gauge` instance bound as `this`, not `MetricsService` — and `webhookQueue` is only assigned once the constructor body runs, which happens after class field initializers. So the `bullmqQueueBacklogSize` gauge is constructed in `onModuleInit()` instead of as a class field, where `this.webhookQueue` is already set and `collect` can be a plain arrow function closing over `this` (the service, not the gauge):

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';
import { WEBHOOK_PROCESSING_QUEUE } from '../../modules/webhooks/infrastructure/webhooks-queue.constants';
import { EMAIL_QUEUE } from '../../modules/notifications/infrastructure/email-queue.constants';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry = new Registry();

  private readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds, by method/route/status_code',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    registers: [this.registry],
  });

  private readonly webhookProcessingDuration = new Histogram({
    name: 'webhook_processing_duration_seconds',
    help: 'Duration of processing a single webhook job end-to-end',
    buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
    registers: [this.registry],
  });

  private readonly bullmqJobFailedTotal = new Counter({
    name: 'bullmq_job_failed_total',
    help: 'Total number of BullMQ jobs that failed, by queue name',
    labelNames: ['queue'],
    registers: [this.registry],
  });

  private bullmqQueueBacklogSize!: Gauge<'queue'>;

  constructor(
    @InjectQueue(WEBHOOK_PROCESSING_QUEUE) private readonly webhookQueue: Queue,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
  ) {}

  onModuleInit(): void {
    this.bullmqQueueBacklogSize = new Gauge({
      name: 'bullmq_queue_backlog_size',
      help: 'Current waiting + active job count, by queue name',
      labelNames: ['queue'],
      collect: async () => {
        const [webhookWaiting, webhookActive, emailWaiting, emailActive] = await Promise.all([
          this.webhookQueue.getWaitingCount(),
          this.webhookQueue.getActiveCount(),
          this.emailQueue.getWaitingCount(),
          this.emailQueue.getActiveCount(),
        ]);
        this.bullmqQueueBacklogSize.set(
          { queue: WEBHOOK_PROCESSING_QUEUE },
          webhookWaiting + webhookActive,
        );
        this.bullmqQueueBacklogSize.set({ queue: EMAIL_QUEUE }, emailWaiting + emailActive);
      },
      registers: [this.registry],
    });
  }

  observeHttpRequest(method: string, route: string, statusCode: number, seconds: number): void {
    this.httpRequestDuration.observe({ method, route, status_code: String(statusCode) }, seconds);
  }

  observeWebhookProcessing(seconds: number): void {
    this.webhookProcessingDuration.observe(seconds);
  }

  incrementBullmqJobFailed(queue: string): void {
    this.bullmqJobFailedTotal.inc({ queue });
  }

  async getMetricsText(): Promise<string> {
    return this.registry.metrics();
  }
}
```

In the unit test (Step 2), `new MetricsService(fakeWebhookQueue as any, fakeEmailQueue as any)` never calls `onModuleInit` (Nest lifecycle hooks only fire inside a bootstrapped module), so the 4th test's `bullmqQueueBacklogSize` would be `undefined` and `getMetricsText()` would not include either queue. Fix the test to call the hook explicitly:

```typescript
  beforeEach(() => {
    fakeWebhookQueue = {
      getWaitingCount: jest.fn().mockResolvedValue(3),
      getActiveCount: jest.fn().mockResolvedValue(1),
    };
    fakeEmailQueue = {
      getWaitingCount: jest.fn().mockResolvedValue(2),
      getActiveCount: jest.fn().mockResolvedValue(1),
    };
    metrics = new MetricsService(fakeWebhookQueue as any, fakeEmailQueue as any);
    metrics.onModuleInit();
  });
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test metrics.service.spec.ts`
Expected: all 4 PASS

- [ ] **Step 7: Create `apps/backend/src/common/observability/metrics.controller.ts`**

```typescript
import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return this.metrics.getMetricsText();
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/common/observability/metrics.service.ts apps/backend/src/common/observability/metrics.controller.ts apps/backend/src/common/observability/metrics.service.spec.ts apps/backend/package.json
git commit -m "feat: add prom-client MetricsService and /metrics endpoint"
```

---

### Task 4: HTTP request duration interceptor

**Files:**
- Create: `apps/backend/src/common/observability/http-metrics.interceptor.ts`
- Test: `apps/backend/src/common/observability/http-metrics.interceptor.spec.ts`

**Interfaces:**
- Consumes: `MetricsService` (Task 3)
- Produces: global `APP_INTERCEPTOR` recording `http_request_duration_seconds` for every request, wired in Task 5's `ObservabilityModule`

- [ ] **Step 1: Write failing unit test**

Create `apps/backend/src/common/observability/http-metrics.interceptor.spec.ts`:

```typescript
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsService } from './metrics.service';

describe('HttpMetricsInterceptor', () => {
  it('records duration with method, route, and response status_code', (done) => {
    const metrics = { observeHttpRequest: jest.fn() } as unknown as MetricsService;
    const interceptor = new HttpMetricsInterceptor(metrics);

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', route: { path: '/health' } }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;

    const next: CallHandler = { handle: () => of('ok') };

    interceptor.intercept(context, next).subscribe(() => {
      expect(metrics.observeHttpRequest).toHaveBeenCalledWith(
        'GET',
        '/health',
        200,
        expect.any(Number),
      );
      done();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test http-metrics.interceptor.spec.ts`
Expected: FAIL — Cannot find module `./http-metrics.interceptor`

- [ ] **Step 3: Create `apps/backend/src/common/observability/http-metrics.interceptor.ts`**

```typescript
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const route = request.route?.path ?? request.url ?? 'unknown';
    const start = process.hrtime.bigint();

    return next.handle().pipe(
      tap(() => {
        const seconds = Number(process.hrtime.bigint() - start) / 1e9;
        this.metrics.observeHttpRequest(request.method, route, response.statusCode, seconds);
      }),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test http-metrics.interceptor.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/common/observability/http-metrics.interceptor.ts apps/backend/src/common/observability/http-metrics.interceptor.spec.ts
git commit -m "feat: add HttpMetricsInterceptor recording http_request_duration_seconds"
```

---

### Task 5: `HealthController` + `ObservabilityModule` wiring

**Files:**
- Create: `apps/backend/src/common/observability/health.controller.ts`
- Create: `apps/backend/src/common/observability/observability.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/src/main.ts`
- Test: `apps/backend/src/common/observability/health.controller.spec.ts`

**Interfaces:**
- Consumes: `DataSource` (global via `TypeOrmModule.forRoot` in `AppModule`, Domain Core plan), `Queue` for `webhook-processing` (Webhook Ingestion plan)
- Produces: `GET /health`, `GET /metrics` mounted app-wide; `JsonLogger` as the app's active logger; `HttpMetricsInterceptor` as a global interceptor

- [ ] **Step 1: Write failing unit test for `HealthController`**

Create `apps/backend/src/common/observability/health.controller.spec.ts`:

```typescript
import { HealthController } from './health.controller';

describe('HealthController', () => {
  function buildController(overrides: {
    postgresOk?: boolean;
    redisOk?: boolean;
    bullmqOk?: boolean;
  }) {
    const dataSource = {
      query: overrides.postgresOk === false ? jest.fn().mockRejectedValue(new Error('down')) : jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const client = {
      ping: overrides.redisOk === false ? jest.fn().mockRejectedValue(new Error('down')) : jest.fn().mockResolvedValue('PONG'),
    };
    const queue = {
      client: Promise.resolve(client),
      getJobCounts:
        overrides.bullmqOk === false
          ? jest.fn().mockRejectedValue(new Error('down'))
          : jest.fn().mockResolvedValue({ waiting: 0 }),
    };
    return new HealthController(dataSource as any, queue as any);
  }

  it('returns status ok and all checks true when everything is healthy', async () => {
    const controller = buildController({});
    const result = await controller.check();
    expect(result.body).toEqual({
      status: 'ok',
      checks: { postgres: true, redis: true, bullmq: true },
    });
    expect(result.httpStatus).toBe(200);
  });

  it('returns status degraded and 503 when postgres is down', async () => {
    const controller = buildController({ postgresOk: false });
    const result = await controller.check();
    expect(result.body.status).toBe('degraded');
    expect(result.body.checks.postgres).toBe(false);
    expect(result.httpStatus).toBe(503);
  });

  it('returns status degraded and 503 when redis is down', async () => {
    const controller = buildController({ redisOk: false });
    const result = await controller.check();
    expect(result.body.checks.redis).toBe(false);
    expect(result.httpStatus).toBe(503);
  });

  it('returns status degraded and 503 when bullmq is down', async () => {
    const controller = buildController({ bullmqOk: false });
    const result = await controller.check();
    expect(result.body.checks.bullmq).toBe(false);
    expect(result.httpStatus).toBe(503);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test health.controller.spec.ts`
Expected: FAIL — Cannot find module `./health.controller`

- [ ] **Step 3: Create `apps/backend/src/common/observability/health.controller.ts`**

`check()` returns a plain `{ httpStatus, body }` object rather than writing directly to an injected `@Res()` response, so the controller stays a pure function the unit test above can call without mocking Express — Nest's `@HttpCode` decorator can't set a *dynamic* status per-call, so the actual HTTP status is set via `@Res({ passthrough: false })` in a thin wrapper method used only by the route:

```typescript
import { Controller, Get, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Response } from 'express';
import { Res } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WEBHOOK_PROCESSING_QUEUE } from '../../modules/webhooks/infrastructure/webhooks-queue.constants';

interface HealthChecks {
  postgres: boolean;
  redis: boolean;
  bullmq: boolean;
}

interface HealthResult {
  httpStatus: number;
  body: { status: 'ok' | 'degraded'; checks: HealthChecks };
}

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @InjectQueue(WEBHOOK_PROCESSING_QUEUE) private readonly webhookQueue: Queue,
  ) {}

  async check(): Promise<HealthResult> {
    const checks: HealthChecks = {
      postgres: await this.checkPostgres(),
      redis: await this.checkRedis(),
      bullmq: await this.checkBullmq(),
    };
    const allHealthy = Object.values(checks).every(Boolean);
    return {
      httpStatus: allHealthy ? 200 : 503,
      body: { status: allHealthy ? 'ok' : 'degraded', checks },
    };
  }

  @Get()
  async handle(@Res() res: Response): Promise<void> {
    const { httpStatus, body } = await this.check();
    res.status(httpStatus).json(body);
  }

  private async checkPostgres(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      const client = await this.webhookQueue.client;
      await client.ping();
      return true;
    } catch {
      return false;
    }
  }

  private async checkBullmq(): Promise<boolean> {
    try {
      await this.webhookQueue.getJobCounts();
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test health.controller.spec.ts`
Expected: all 4 PASS

- [ ] **Step 5: Create `apps/backend/src/common/observability/observability.module.ts`**

```typescript
import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { WEBHOOK_PROCESSING_QUEUE } from '../../modules/webhooks/infrastructure/webhooks-queue.constants';
import { EMAIL_QUEUE } from '../../modules/notifications/infrastructure/email-queue.constants';
import { RequestIdStore } from './request-id.store';
import { RequestIdMiddleware } from './request-id.middleware';
import { JsonLogger } from './json-logger.service';
import { MetricsService } from './metrics.service';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({ name: WEBHOOK_PROCESSING_QUEUE }),
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    RequestIdStore,
    JsonLogger,
    MetricsService,
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
  exports: [RequestIdStore, JsonLogger, MetricsService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
```

`BullModule.registerQueue({ name: WEBHOOK_PROCESSING_QUEUE })` here and in `WebhooksModule` (Webhook Ingestion plan), plus `BullModule.registerQueue({ name: EMAIL_QUEUE })` here and in `NotificationsModule` (Email Notification plan), resolve to the same underlying BullMQ queue instances keyed by name + connection options — Nest's BullMQ integration treats repeated registration of the same queue name as idempotent, so this does not create duplicate queues or consumers.

- [ ] **Step 6: Register `ObservabilityModule` in `apps/backend/src/app.module.ts`**

Add `ObservabilityModule` to `imports` (with `import { ObservabilityModule } from './common/observability/observability.module';`), alongside the existing `OrganizationsModule, CustomersModule, InvoicesModule, ReceivablesModule, PaymentsModule, BankAccountsModule, WebhooksModule` from the Multi-tenancy and Webhook Ingestion plans.

- [ ] **Step 7: Wire `JsonLogger` as the app's active logger in `apps/backend/src/main.ts`**

Modify `apps/backend/src/main.ts` — after `const app = await NestFactory.create(AppModule, { bufferLogs: true });`, add:

```typescript
app.useLogger(app.get(JsonLogger));
```

(`bufferLogs: true` on `NestFactory.create` ensures Nest's own bootstrap logs — normally lost before a custom logger is attached — are buffered and flushed through `JsonLogger` too, so even startup logs come out as structured JSON.)

- [ ] **Step 8: Verify app boots and both endpoints respond**

Run: `docker compose up -d postgres redis && pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS (full suite, including Task 7's new e2e spec below)

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/common/observability apps/backend/src/app.module.ts apps/backend/src/main.ts
git commit -m "feat: wire ObservabilityModule (health, metrics, JSON logging) into AppModule"
```

---

### Task 6: Record webhook/email processing metrics in `WebhookProcessor` and `EmailQueueProcessor`

**Files:**
- Modify: `apps/backend/src/modules/webhooks/infrastructure/webhook.processor.ts`
- Modify: `apps/backend/src/modules/webhooks/webhooks.module.ts`
- Modify: `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts`
- Modify: `apps/backend/src/modules/notifications/notifications.module.ts`

**Interfaces:**
- Consumes: `MetricsService` (Task 3, injected via `ObservabilityModule` being `@Global`) and `EMAIL_QUEUE`
- Produces: real failure counts for both `webhook-processing` and `email-queue`, plus webhook duration data, closing the loop from spec section 3

**(2026-08-10: both processors have evolved since this task was drafted — rewritten below as merges into the real current files, not full-file replacements. See the rescoping note at the top of this plan.)**

- [ ] **Step 1: Modify `WebhookProcessor` to time `process()` and increment the failure counter inside its existing `onFailed`**

The real current `apps/backend/src/modules/webhooks/infrastructure/webhook.processor.ts` already has dead-letter-queue logging in `onFailed` (added by the Webhook Ingestion plan) that must be preserved:

```typescript
@Processor(WEBHOOK_PROCESSING_QUEUE)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private readonly processWebhook: ProcessWebhookUseCase) {
    super();
  }
  async process(job: Job<WebhookJobData>): Promise<void> {
    await this.processWebhook.execute(
      job.data.webhookInboxId,
      job.data.organizationId,
    );
  }

  // Spec §4.3: after the retry budget is exhausted, the job moves to the
  // Dead Letter Queue. WebhookInbox is already left in FAILED status by
  // ProcessWebhookUseCase on every attempt (with retryCount incremented) —
  // this only logs the terminal transition, same convention as
  // EmailQueueProcessor.onFailed.
  @OnWorkerEvent('failed')
  onFailed(job: Job<WebhookJobData> | undefined): void {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return;
    this.logger.error(
      `Webhook job ${job.id ?? 'unknown'} moved to dead letter after ${job.attemptsMade} attempts (webhookInboxId=${job.data.webhookInboxId})`,
    );
  }
}
```

Add a `MetricsService` constructor dependency, time `process()`, and increment the counter **on every failed attempt** (not gated behind the `maxAttempts` dead-letter check below it — the metric should count all failures, the dead-letter log should only fire on the terminal one):

```typescript
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MetricsService } from '../../../common/observability/metrics.service';
import { ProcessWebhookUseCase } from '../application/process-webhook.usecase';
import { WEBHOOK_PROCESSING_QUEUE } from './webhooks-queue.constants';

interface WebhookJobData {
  webhookInboxId: string;
  organizationId: string;
}

@Processor(WEBHOOK_PROCESSING_QUEUE)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private readonly processWebhook: ProcessWebhookUseCase,
    private readonly metrics: MetricsService,
  ) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    const start = process.hrtime.bigint();
    try {
      await this.processWebhook.execute(
        job.data.webhookInboxId,
        job.data.organizationId,
      );
    } finally {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.observeWebhookProcessing(seconds);
    }
  }

  // Spec §4.3: after the retry budget is exhausted, the job moves to the
  // Dead Letter Queue. WebhookInbox is already left in FAILED status by
  // ProcessWebhookUseCase on every attempt (with retryCount incremented) —
  // this only logs the terminal transition, same convention as
  // EmailQueueProcessor.onFailed.
  @OnWorkerEvent('failed')
  onFailed(job: Job<WebhookJobData> | undefined): void {
    if (!job) return;
    this.metrics.incrementBullmqJobFailed(WEBHOOK_PROCESSING_QUEUE);
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return;
    this.logger.error(
      `Webhook job ${job.id ?? 'unknown'} moved to dead letter after ${job.attemptsMade} attempts (webhookInboxId=${job.data.webhookInboxId})`,
    );
  }
}
```

- [ ] **Step 2: Modify `EmailQueueProcessor` to increment the failure counter in both `job.name` branches of its existing `onFailed`**

The real current `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts` (139 lines, added by the Reminder Automation plan) branches on `job.name` — `'send-auth-email'` vs. reminder email — in both `process()` and `onFailed()`. Only `onFailed()` needs a change, adding the metric increment as the very first line so it fires for both branches before either one returns:

```typescript
  @OnWorkerEvent('failed')
  async onFailed(job: Job): Promise<void> {
    this.metrics.incrementBullmqJobFailed(EMAIL_QUEUE);

    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return;

    if (job.name === 'send-auth-email') {
      this.logger.error(
        `Auth email job ${job.id ?? 'unknown'} failed permanently after ${job.attemptsMade} attempts`,
      );
      return;
    }

    const data = job.data as ReminderEmailJob;
    const { reminderExecutionId, receivableId, organizationId } = data;
    await this.tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      async () => {
        await this.executionRepo.updateSendResult(
          reminderExecutionId,
          'FAILED',
          null,
        );
        this.eventEmitter.emit('reminder.execution.completed', {
          id: reminderExecutionId,
          status: 'FAILED',
          providerMessageId: null,
          organizationId,
        });
      },
    );
    this.logger.error(
      `Email job ${job.id ?? 'unknown'} failed permanently after ${job.attemptsMade} attempts`,
    );
  }
```

Add `private readonly metrics: MetricsService` to the constructor and `import { MetricsService } from '../../../common/observability/metrics.service';`. `process()` is untouched — timing/duration metrics were only specced for webhook processing (spec section 3 lists `webhook_processing_duration_seconds`, not an email equivalent), so no change there.

- [ ] **Step 3: Run the existing webhook and notifications unit/e2e suites**

Run: `pnpm --filter @casso-ledger/backend test webhook && pnpm --filter @casso-ledger/backend test:e2e -- webhook-matching.e2e-spec.ts`
Expected: PASS — `MetricsService` is provided by the now-`@Global` `ObservabilityModule`, so `WebhooksModule`/`NotificationsModule` need no import changes to resolve it. (**2026-08-10:** file name corrected — `webhook-idempotency.integration.spec.ts`/`webhook-matching-routing.integration.spec.ts` referenced by this task's original draft don't exist; the real, current e2e file is `webhook-matching.e2e-spec.ts`, per Plan #22's rescoping.)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/webhooks/infrastructure/webhook.processor.ts apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts
git commit -m "feat: record webhook and email BullMQ metrics"
```

---

### Task 7: e2e test — `GET /health` and `GET /metrics`

**Files:**
- Create: `apps/backend/test/health-and-metrics.e2e-spec.ts`

**Interfaces:**
- Consumes: full `AppModule` (all prior plans + this one), real Postgres + Redis (via the already-running local `docker compose` containers — no testcontainers needed for this check per the hard rule)

- [ ] **Step 1: Write the e2e test**

Create `apps/backend/test/health-and-metrics.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health and metrics (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 with status ok and all checks true when dependencies are up', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      checks: { postgres: true, redis: true, bullmq: true },
    });
  });

  it('GET /metrics returns Prometheus text format including required metrics and both BullMQ queues', async () => {
    const response = await request(app.getHttpServer()).get('/metrics').expect(200);

    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('# HELP http_request_duration_seconds');
    expect(response.text).toContain('# HELP webhook_processing_duration_seconds');
    expect(response.text).toContain('# HELP bullmq_job_failed_total');
    expect(response.text).toContain('# HELP bullmq_queue_backlog_size');
    expect(response.text).toContain('bullmq_queue_backlog_size{queue="webhook-processing"}');
    expect(response.text).toContain('bullmq_queue_backlog_size{queue="email-queue"}');
  });
});
```

- [ ] **Step 2: Run the e2e test**

Run: `docker compose up -d postgres redis && pnpm --filter @casso-ledger/backend test:e2e -- health-and-metrics.e2e-spec.ts`
Expected: both tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/health-and-metrics.e2e-spec.ts
git commit -m "test: add e2e coverage for GET /health and GET /metrics"
```

---

### Task 8: `apps/backend/Dockerfile` (multi-stage Node build)

**Files:**
- Create: `apps/backend/Dockerfile`

**Interfaces:**
- Consumes: `apps/backend/package.json`, root `pnpm-workspace.yaml`/`turbo.json` (Domain Core plan)
- Produces: a `casso-backend` image, used by Task 10's `docker-compose.yml` `backend` service

- [ ] **Step 1: Create `apps/backend/Dockerfile`**

```dockerfile
# ---- deps: install full workspace deps (dev+prod) for the build stage ----
FROM node:20-alpine AS deps
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/backend/package.json apps/backend/package.json
RUN pnpm install --frozen-lockfile

# ---- build: compile TypeScript to dist ----
FROM node:20-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY --from=deps /repo/apps/backend/node_modules ./apps/backend/node_modules
COPY . .
RUN pnpm --filter @casso-ledger/backend build

# ---- prod-deps: install production-only deps for the runtime image ----
FROM node:20-alpine AS prod-deps
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/backend/package.json apps/backend/package.json
RUN pnpm install --frozen-lockfile --prod

# ---- runtime: minimal final image ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/packages/shared-types ./packages/shared-types
COPY --from=build /repo/apps/backend/dist ./dist
COPY apps/backend/package.json ./package.json
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["node", "dist/main.js"]
```

Four stages keep the `deps`/`build` stages (which need full `devDependencies` for `tsc`) out of the final image, while `prod-deps` gives the runtime image only what `node dist/main.js` actually needs — smaller image, smaller attack surface, same pattern pnpm's own Docker docs recommend for monorepos.

- [ ] **Step 2: Commit**

```bash
git add apps/backend/Dockerfile
git commit -m "chore: add multi-stage Dockerfile for backend"
```

---

### Task 9: `apps/frontend/Dockerfile` + `nginx.conf` (multi-stage Vite build → nginx serve)

**Files:**
- Create: `apps/frontend/Dockerfile`
- Create: `apps/frontend/nginx.conf`

**Interfaces:**
- Consumes: `apps/frontend/package.json` producing a `dist/` folder via `vite build` (standard Vite React app per `2026-08-03-frontend-design-system.md` spec — no frontend plan exists yet to modify, so this Dockerfile only assumes the standard `pnpm build` → `dist/` contract every Vite app has)
- Produces: a `casso-frontend` image serving static files on port 80, used by Task 10's `docker-compose.yml` `frontend` service

- [ ] **Step 1: Create `apps/frontend/nginx.conf`**

```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  gzip on;
  gzip_types text/plain text/css application/javascript application/json image/svg+xml;
  gzip_min_length 1024;

  # SPA fallback: any unmatched path serves index.html so client-side routing works
  location / {
    try_files $uri $uri/ /index.html;
  }

  # long-cache hashed build assets, never cache the HTML shell
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  location = /index.html {
    add_header Cache-Control "no-cache";
  }
}
```

- [ ] **Step 2: Create `apps/frontend/Dockerfile`**

```dockerfile
# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/frontend/package.json apps/frontend/package.json
RUN pnpm install --frozen-lockfile

# ---- build ----
FROM node:20-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY --from=deps /repo/apps/frontend/node_modules ./apps/frontend/node_modules
COPY . .
RUN pnpm --filter @casso-ledger/frontend build

# ---- runtime: nginx serving the static dist/ output ----
FROM nginx:1.27-alpine AS runtime
COPY --from=build /repo/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:80/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/Dockerfile apps/frontend/nginx.conf
git commit -m "chore: add multi-stage Dockerfile and nginx.conf for frontend"
```

---

### Task 10: Extend `docker-compose.yml` to the full 4-service compose

**Files:**
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: `apps/backend/Dockerfile` (Task 8), `apps/frontend/Dockerfile` (Task 9)
- Produces: the spec's required 4-service compose (`backend`, `frontend`, `postgres`, `redis`), usable for `docker compose up` as a full local vertical-slice demo

The Domain Core plan's Task 5 created:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: casso
      POSTGRES_PASSWORD: casso
      POSTGRES_DB: casso_ledger
    ports:
      - "5432:5432"
    volumes:
      - casso_pg_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    ports:
      - "6379:6379"

volumes:
  casso_pg_data:
```

- [ ] **Step 1: Modify `docker-compose.yml`, adding `backend` and `frontend`**

`postgres` and `redis` are unchanged from Task 5 above. The full file becomes:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: casso
      POSTGRES_PASSWORD: casso
      POSTGRES_DB: casso_ledger
    ports:
      - "5432:5432"
    volumes:
      - casso_pg_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    ports:
      - "6379:6379"

  backend:
    build:
      context: .
      dockerfile: apps/backend/Dockerfile
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USERNAME: casso
      DB_PASSWORD: casso
      DB_DATABASE: casso_ledger
      REDIS_HOST: redis
      REDIS_PORT: 6379
      JWT_SECRET: ${JWT_SECRET:-dev-only-change-me}
      CASSO_WEBHOOK_CLIENT_ID: ${CASSO_WEBHOOK_CLIENT_ID:-dev-client}
      CASSO_WEBHOOK_SECRET_KEY: ${CASSO_WEBHOOK_SECRET_KEY:-dev-secret}
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis

  frontend:
    build:
      context: .
      dockerfile: apps/frontend/Dockerfile
    ports:
      - "8080:80"
    depends_on:
      - backend

volumes:
  casso_pg_data:
```

`build.context: .` (repo root, not `apps/backend`) is required because each Dockerfile's `deps`/`build` stages `COPY` root-level `pnpm-workspace.yaml` and the `packages/shared-types` workspace dependency — a pnpm workspace build context must include the whole monorepo, not just one app's folder.

- [ ] **Step 2: Verify the full stack starts**

Run: `docker compose up -d --build`
Expected: `docker compose ps` shows all 4 services `running`/`healthy`; `curl http://localhost:3000/health` returns `{"status":"ok",...}`; `curl http://localhost:8080/` returns the frontend's `index.html`

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: extend docker-compose to 4 services (add backend + frontend)"
```

---

### Task 11 (2026-08-10 addition): `pg_dump` daily backup cron service

**Files:**
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: the `postgres` service (Task 5's compose base)
- Produces: spec section 5's required daily, compressed, 7-copy-rotated `pg_dump` backup written to a `./backups` volume outside the Postgres container

Spec section 5: *"a separate `pg_dump` cron container/service in Docker Compose, running daily, compressed, and written to the `./backups` volume mounted outside the Postgres container; keep the 7 most recent copies (rotate and delete older copies)."* This was never in this plan's original task list (a plan-level gap, not a scope decision — see Self-Review Notes). Per the ladder in this project's own conventions (favor an existing, maintained tool over hand-rolling one), use `prodrigestivill/postgres-backup-local` — a small, widely-used image that does exactly this (cron-scheduled `pg_dump`, gzip compression, day/week/month-bucketed rotation) via environment variables, instead of writing a custom cron script + Dockerfile.

- [ ] **Step 1: Add the `backup` service to `docker-compose.yml`**

```yaml
  backup:
    image: prodrigestivill/postgres-backup-local:16
    environment:
      POSTGRES_HOST: postgres
      POSTGRES_DB: casso_ledger
      POSTGRES_USER: casso
      POSTGRES_PASSWORD: ${DB_PASSWORD:?DB_PASSWORD is required}
      SCHEDULE: '@daily'
      BACKUP_KEEP_DAYS: 7
      BACKUP_KEEP_WEEKS: 0
      BACKUP_KEEP_MONTHS: 0
    volumes:
      - ./backups:/backups
    logging: *json-file-logging
    depends_on:
      - postgres
```

`BACKUP_KEEP_DAYS: 7` with a `@daily` schedule and `BACKUP_KEEP_WEEKS`/`BACKUP_KEEP_MONTHS` both `0` matches the spec's "keep the 7 most recent copies (rotate and delete older copies)" literally — one dump per day, seven retained, nothing older. `./backups` is a bind mount (not a named volume) so it lives outside the Postgres container/volume, per spec.

- [ ] **Step 2: Verify**

Run: `docker compose up -d backup` (with `postgres` already running) — confirm the container starts without error and, after triggering a manual run (`docker compose exec backup /backup.sh` — the image's documented manual-trigger entrypoint), a `.sql.gz` file appears under `./backups/`.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add daily pg_dump backup service with 7-copy rotation"
```

---

## Self-Review Notes

- **Spec coverage:** `GET /health` with `{status, checks}` shape + 503 on failure (deployment spec section 1) → Task 5. Structured JSON logs with required fields incl. `requestId` correlation (section 2) → Task 1, Task 2. `/metrics` with all 4 required series plus `email-queue` backlog/failure labels (section 3 and the email notification contract) → Task 3, Task 4, Task 6. Distributed tracing explicitly deferred (section 4) → not built, matches spec. 4-service `docker-compose.yml` (section 1) → Task 10. Dockerfiles for both apps → Task 8, Task 9.
- **Deliberate scope decisions flagged inline:** no `@nestjs/terminus` (Architecture paragraph — fixed set of 3 checks doesn't need the indicator abstraction); no `nestjs-pino` (same paragraph — stdout-only JSON satisfies the spec without transport plumbing); `requestId` uses its own `AsyncLocalStorage` rather than reusing `TenantContextService`'s store (Architecture paragraph — unauthenticated routes like `/health` still need a `requestId` but never populate `TenantContextService`).
- **Not covered in this plan (by design, per spec section 5):** Grafana dashboards, Loki log aggregation, Tempo/OpenTelemetry tracing, alerting (PagerDuty/Slack), Kubernetes — all explicitly out of scope for this MVP per the spec's "Out of scope" section.
- **Open question from spec section 6 resolved:** `requestId` honors an incoming `x-request-id` header (e.g. from a future reverse proxy) and falls back to generating a `randomUUID()` — see Task 1 Step 5 comment. Retention limits for logs/metrics in the demo environment are left unresolved (genuinely non-blocking per the spec) — Docker's default json-file log driver has no size cap configured here; revisit if demo Docker volumes fill up.
- **Cross-plan consistency checked:** `WEBHOOK_PROCESSING_QUEUE = 'webhook-processing'` and `EMAIL_QUEUE = 'email-queue'` are imported from their owning plans and reused verbatim in `HealthController`, `MetricsService`, `WebhookProcessor`, and `EmailQueueProcessor`; the backlog/failure metrics therefore cover both BullMQ queues without inventing a duplicate queue token. `DataSource` injection in `HealthController` follows the same no-forFeature-needed pattern already used by `AllocatePaymentUseCase` (Multi-tenancy plan), since `TypeOrmCoreModule` is global. `ObservabilityModule` being `@Global` means both workers consume `MetricsService` without a second observability module.

**2026-08-10 grilling-session decisions (superseding the "Deliberate scope decisions" bullet above where it conflicts):**

- `requestId` still uses its own `AsyncLocalStorage` (`RequestIdStore`), for the same reason originally given (unauthenticated routes need one but never populate `TenantContextService`) — **but** it is now the *single* source of truth: `TenantContextInterceptor` (shipped after this plan was drafted, already independently minting its own `requestId` for audit-log fingerprinting in `invoice-import`) is modified in Task 1 to read from `RequestIdStore` instead of generating a second, divergent ID. Without this fix, one authenticated HTTP request would have ended up with two different `requestId` values across logs vs. audit records.
- `WebhookProcessor`/`EmailQueueProcessor` (Task 6) already carry `onFailed` logic this plan didn't know about when drafted (dead-letter logging; `job.name`-branched auth-email vs. reminder-email handling, respectively) — the metric increment is merged into the existing bodies, not pasted over them.
- `HealthController` calling `DataSource`/`Queue` directly (Task 5), with no use-case layer, was confirmed as a deliberate, documented exception to `.claude/rules/api.md`'s "controller only calls use case" rule — `/health` (like `/metrics`) is a cross-cutting `common/` system-status endpoint, not business-domain logic under `modules/`.
- **Undocumented-at-plan-time addition, confirmed correct by code review:** both `WebhookProcessor.process()`/`.onFailed()` and `EmailQueueProcessor.process()`/`.onFailed()` wrap their bodies in `this.requestIdStore.run(getJobRequestId(job), ...)` (a small helper producing `` `bullmq:${job.id ?? randomUUID()}` ``) — extending spec section 4's "follow a request within one process via log context" goal from HTTP requests to background BullMQ jobs, so job-triggered log lines also carry a `requestId`. Not in Task 6's original code samples; noted here so it isn't mistaken for missing coverage later.
- **Spec section 5 gap, found by code review, fixed in a follow-up commit:** the `pg_dump` daily-backup cron service was never in this plan's task list at all (unlike the Grafana/Loki/Tempo/K8s items, which section 6 explicitly excludes) — a plan-level oversight, not a deviation during implementation. Added as Task 11 below.


