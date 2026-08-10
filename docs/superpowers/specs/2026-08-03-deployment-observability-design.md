# Deployment & Observability Design (MVP)

> Child spec of [docs/overview.md](../../../docs/overview.md). Reduces the observability stack proposed in sections 14/20 of the original document (OpenTelemetry + Prometheus + Grafana + Loki + Tempo) to a level appropriate for the demo scale.

## 1. Docker Compose

```
docker-compose.yml
  services:
    backend:   NestJS modular monolith (API + BullMQ worker in the same process,
               split into a separate container later if independent scaling is needed)
    frontend:  Static Vite build, served through nginx
    postgres:  PostgreSQL
    redis:     Redis (BullMQ queue/scheduler)
```

Four services are enough to run the full vertical slice for the demo; do not add pgAdmin/RedisInsight or a separate observability service at this stage (use personal desktop tools for local debugging instead of adding them to the shared compose file).

### Health check

```
backend healthcheck:
  GET /health → { status: 'ok' | 'degraded', checks: { postgres: bool, redis: bool, bullmq: bool } }
```

Return `503` if any check fails—used by the Docker `HEALTHCHECK` directive and a future load balancer.

## 2. Logging

Write structured JSON logs to stdout, with no separate log files; the Docker log driver collects them directly, so Loki is not needed in the MVP.

Required fields in every log entry:
```
timestamp, level, organizationId (if present), userId (if present), message, context (module/service name)
```

## 3. Metrics

`/metrics` endpoint following the Prometheus standard (using `prom-client`). Must expose:

```
http_request_duration_seconds     (histogram, by route)
webhook_processing_duration_seconds
bullmq_job_failed_total           (by queue name)
bullmq_queue_backlog_size         (by queue name)
```

It is enough to demonstrate that the endpoint can be scraped (`curl /metrics` returns the correct format); do not build a real Grafana dashboard in the MVP, as that belongs to a later operations phase.

## 4. Distributed tracing—deferred

Defer OpenTelemetry/Tempo: the modular monolith is a single process, with no independent services to trace across. Log context (`organizationId` + `requestId` generated per request and attached to every log entry in that request) is enough to follow a request within one process.

## 5. Backup & retention (MVP)

- **Database backup:** a separate `pg_dump` cron container/service in Docker Compose, running daily, compressed, and written to the `./backups` volume mounted outside the Postgres container; keep the **7 most recent copies** (rotate and delete older copies) for demo/manual recovery—real WAL streaming/PITR is not needed at MVP scale.
- **Log retention:** JSON logs go to stdout; the Docker daemon limits them with `max-size: 10m, max-file: 5` (the `json-file` log driver). No separate aggregation service is used in the MVP (Loki is deferred; see Out of scope).
- **Data retention/deletion requests:** no automation yet; handle valid requests manually through direct queries (automated compliance is out of scope for the MVP; see OVERVIEW section 16).

## 6. Out of scope

- Grafana dashboards, Loki log aggregation, and Tempo distributed tracing—add when services are split or real production deployment begins.
- Alerting (PagerDuty/Slack) for webhook error rate and queue backlog—needed when real on-call exists (section 20 of the original document).
- Kubernetes—the modular monolith plus Docker Compose is sufficient (excluded by section 9.4 of the original document).
- Real point-in-time recovery/WAL streaming and off-site/multi-region backups—add for real production, outside this project's scope.

## 7. Open questions (do not block implementation)

- ~~At which layer should `requestId` be generated (NestJS middleware or the `X-Request-Id` header when provided by a reverse proxy)?~~ **Resolved 2026-08-10 (Plan #23 grilling session):** a `RequestIdMiddleware` generates/reads it once, as early as possible in the request lifecycle (honoring an incoming `X-Request-Id` header from a reverse proxy if present, generating a UUID otherwise) — this is the single source of truth for the whole request, including unauthenticated paths (`/health`, webhook ingestion) and background BullMQ jobs. `TenantContextInterceptor` (shipped by the Multi-tenancy/RBAC plan, after this spec was written) already independently generates its own `requestId` for authenticated HTTP requests and stores it on `AuthenticatedUser.requestId` for audit-log fingerprinting (`invoice-import` module) — it must be changed to read from the same middleware-populated store instead of minting a second, divergent ID, so one HTTP request always has exactly one `requestId` across logs, audit trails, and response headers.
