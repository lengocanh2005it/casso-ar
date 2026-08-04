# Deployment & Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the MVP observability slice — `GET /health` (Docker healthcheck + LB probe), structured JSON logs to stdout with per-request `requestId` correlation, a `/metrics` Prometheus endpoint, and Dockerfiles for `apps/backend`/`apps/frontend` — then extend the Domain Core plan's `docker-compose.yml` (currently `postgres` + `redis` only) to the full 4-service compose the spec requires.

**Architecture:** All observability code lives in one `apps/backend/src/common/observability/` module (`ObservabilityModule`, marked `@Global` so `JsonLogger` and `MetricsService` are injectable anywhere without re-importing). Health check is a **plain custom controller**, not `@nestjs/terminus`: there are exactly 3 known dependencies to probe (Postgres, Redis, BullMQ) and terminus's `HealthIndicator` abstraction exists to make N heterogeneous checks pluggable — with N fixed at 3 and never growing without a spec change, a ~30-line controller is less code and one fewer dependency than wiring terminus's indicator classes. Logging is a **custom `LoggerService` implementation** (`JsonLogger`), not `nestjs-pino`: pino's value is transport plumbing (multiple destinations, log rotation, worker-thread serialization) which this MVP explicitly doesn't need (spec mục 2: stdout only, Docker log driver collects it) — a class that JSON-stringifies to `process.stdout.write` satisfies the exact required field list with zero new runtime dependencies. `requestId` is generated in a small `RequestIdMiddleware` and stored in its own `AsyncLocalStorage` (kept separate from the existing `TenantContextService` ALS from the Multi-tenancy plan, because `requestId` exists on every request — including unauthenticated ones like `/health` and the webhook endpoint's queue-processing path — while `TenantContextService`'s store is only populated post-JWT-auth); `JsonLogger` reads both stores and merges whatever is present.

**Tech Stack:** `prom-client` (Prometheus metrics), Node `AsyncLocalStorage` (request correlation, same pattern as `TenantContextService`), multi-stage Docker builds (`node:20-alpine` for backend, `node:20-alpine` + `nginx:alpine` for frontend), Docker Compose.

## Global Constraints

- No `@nestjs/terminus`, no `nestjs-pino` — justified above; do not introduce either without revisiting this decision.
- Every log line is a single JSON object on stdout with at minimum `timestamp, level, message, context`; `requestId` is always present when logged inside an HTTP request or a BullMQ job; `organizationId`/`userId` are present only when `TenantContextService` has a populated store (spec mục 2 says "nếu có").
- `/health` returns `200` with `{ status: 'ok', checks: {...} }` when all three checks pass, `503` with `{ status: 'degraded', checks: {...} }` otherwise — never throws an unhandled error for a down dependency (deployment spec mục 1).
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
    modules/webhooks/infrastructure/webhook.processor.ts  -- MODIFY: record webhook_processing_duration_seconds, bullmq_job_failed_total
    modules/notifications/infrastructure/email-queue.processor.ts -- MODIFY: record bullmq_job_failed_total for email-queue
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

`x-request-id` is honored if a reverse proxy already set one (open question from the spec mục 6 — resolved in favor of "use it if present, generate if not," which is the standard pattern and requires no extra config).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/common/observability/request-id.store.ts apps/backend/src/common/observability/request-id.middleware.ts apps/backend/src/common/observability/request-id.store.spec.ts
git commit -m "feat: add per-request requestId store and middleware"
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
- Produces: real failure counts for both `webhook-processing` and `email-queue`, plus webhook duration data, closing the loop from spec mục 3

- [ ] **Step 1: Modify `WebhookProcessor` to time `process()` and hook the `failed` worker event**

The Webhook Ingestion plan's `webhook.processor.ts` (its Task 9 Step 6) is:

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { WEBHOOK_PROCESSING_QUEUE } from './webhooks-queue.constants';
import { ProcessWebhookUseCase } from '../application/process-webhook.usecase';

@Processor(WEBHOOK_PROCESSING_QUEUE)
export class WebhookProcessor extends WorkerHost {
  constructor(private readonly processWebhookUseCase: ProcessWebhookUseCase) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    await this.processWebhookUseCase.execute(job.data.webhookInboxId);
  }
}
```

Replace it with:

```typescript
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { WEBHOOK_PROCESSING_QUEUE } from './webhooks-queue.constants';
import { ProcessWebhookUseCase } from '../application/process-webhook.usecase';
import { MetricsService } from '../../../common/observability/metrics.service';

@Injectable()
@Processor(WEBHOOK_PROCESSING_QUEUE)
export class WebhookProcessor extends WorkerHost {
  constructor(
    private readonly processWebhookUseCase: ProcessWebhookUseCase,
    private readonly metrics: MetricsService,
  ) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    const start = process.hrtime.bigint();
    try {
      await this.processWebhookUseCase.execute(job.data.webhookInboxId);
    } finally {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.observeWebhookProcessing(seconds);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(): void {
    this.metrics.incrementBullmqJobFailed(WEBHOOK_PROCESSING_QUEUE);
  }
}
```

(`@Injectable()` was implicit before via `@Processor()`'s own metadata in Nest's BullMQ integration, but making it explicit costs nothing and documents that this class now has a second constructor dependency injected through Nest's DI, not just decorator magic.)

Also modify `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts` to inject the same global `MetricsService` and count failures for the existing `EMAIL_QUEUE` without changing the email retry or `ReminderExecution` behavior. Add the import and constructor parameter:

```typescript
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EMAIL_QUEUE } from './email-queue.constants';
import { MetricsService } from '../../../common/observability/metrics.service';
```

Append `private readonly metrics: MetricsService` to the existing `EmailQueueProcessor` constructor, and make its existing `onFailed(job)` begin with:

```typescript
  @OnWorkerEvent('failed')
  async onFailed(job: Job<EmailJobData>): Promise<void> {
    this.metrics.incrementBullmqJobFailed(EMAIL_QUEUE);

    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return; // more retries scheduled — existing final-failure logic stays below this guard
    }

    await this.reminderExecutionRepo.updateSendResult(job.data.reminderExecutionId, 'FAILED', null);
    this.eventEmitter.emit('reminder.failed', {
      reminderExecutionId: job.data.reminderExecutionId,
      receivableId: job.data.receivableId,
      organizationId: job.data.organizationId,
    });
    this.logger.error(
      `Email job ${job.id} failed permanently after ${job.attemptsMade} attempts (reminderExecutionId=${job.data.reminderExecutionId})`,
    );
  }
```

The existing `process(job)` body and final-attempt update remain exactly as defined by the Email Notification plan; the metric increments on every failed attempt, while `ReminderExecution.status = FAILED` remains final-attempt-only.

- [ ] **Step 2: Run the existing `process-webhook.usecase.spec.ts` and webhook e2e suite**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- webhook-idempotency.integration.spec.ts webhook-matching-routing.integration.spec.ts`
Expected: PASS — `MetricsService` is provided by the now-`@Global` `ObservabilityModule`, so `WebhooksModule` needs no import changes to resolve it.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/webhooks/infrastructure/webhook.processor.ts
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

## Self-Review Notes

- **Spec coverage:** `GET /health` with `{status, checks}` shape + 503 on failure (deployment spec mục 1) → Task 5. Structured JSON logs with required fields incl. `requestId` correlation (mục 2) → Task 1, Task 2. `/metrics` with all 4 required series plus `email-queue` backlog/failure labels (mục 3 and the email notification contract) → Task 3, Task 4, Task 6. Distributed tracing explicitly deferred (mục 4) → not built, matches spec. 4-service `docker-compose.yml` (mục 1) → Task 10. Dockerfiles for both apps → Task 8, Task 9.
- **Deliberate scope decisions flagged inline:** no `@nestjs/terminus` (Architecture paragraph — fixed set of 3 checks doesn't need the indicator abstraction); no `nestjs-pino` (same paragraph — stdout-only JSON satisfies the spec without transport plumbing); `requestId` uses its own `AsyncLocalStorage` rather than reusing `TenantContextService`'s store (Architecture paragraph — unauthenticated routes like `/health` still need a `requestId` but never populate `TenantContextService`).
- **Not covered in this plan (by design, per spec mục 5):** Grafana dashboards, Loki log aggregation, Tempo/OpenTelemetry tracing, alerting (PagerDuty/Slack), Kubernetes — all explicitly out of scope for this MVP per the spec's "Ngoài phạm vi" section.
- **Open question from spec mục 6 resolved:** `requestId` honors an incoming `x-request-id` header (e.g. from a future reverse proxy) and falls back to generating a `randomUUID()` — see Task 1 Step 5 comment. Retention limits for logs/metrics in the demo environment are left unresolved (genuinely non-blocking per the spec) — Docker's default json-file log driver has no size cap configured here; revisit if demo Docker volumes fill up.
- **Cross-plan consistency checked:** `WEBHOOK_PROCESSING_QUEUE = 'webhook-processing'` and `EMAIL_QUEUE = 'email-queue'` are imported from their owning plans and reused verbatim in `HealthController`, `MetricsService`, `WebhookProcessor`, and `EmailQueueProcessor`; the backlog/failure metrics therefore cover both BullMQ queues without inventing a duplicate queue token. `DataSource` injection in `HealthController` follows the same no-forFeature-needed pattern already used by `AllocatePaymentUseCase` (Multi-tenancy plan), since `TypeOrmCoreModule` is global. `ObservabilityModule` being `@Global` means both workers consume `MetricsService` without a second observability module.


