# Deployment & Observability Design (MVP)

> Spec con của [docs/overview.md](../../../docs/overview.md). Thu gọn stack quan sát đề xuất ở tài liệu gốc mục 14/20 (OpenTelemetry + Prometheus + Grafana + Loki + Tempo) xuống mức phù hợp quy mô thực tập.

## 1. Docker Compose

```
docker-compose.yml
  services:
    backend:   NestJS modular monolith (API + BullMQ worker cùng process,
               tách container riêng sau nếu cần scale độc lập)
    frontend:  Vite build tĩnh, serve qua nginx
    postgres:  PostgreSQL
    redis:     Redis (BullMQ queue/scheduler)
```

4 service là đủ để chạy toàn bộ vertical slice cho demo/thực tập — không thêm pgAdmin/RedisInsight hay service quan sát riêng ở bước này (dùng công cụ desktop cá nhân nếu cần debug local, không cần đưa vào compose chung).

### Health check

```
backend healthcheck:
  GET /health → { status: 'ok' | 'degraded', checks: { postgres: bool, redis: bool, bullmq: bool } }
```

Trả `503` nếu bất kỳ check nào fail — dùng cho Docker `HEALTHCHECK` directive và load balancer sau này.

## 2. Logging

Structured JSON log ra stdout, không ghi file riêng — Docker log driver thu thập trực tiếp, không cần Loki ở MVP.

Field bắt buộc trong mỗi log entry:
```
timestamp, level, organizationId (nếu có), userId (nếu có), message, context (module/service name)
```

## 3. Metrics

`/metrics` endpoint theo chuẩn Prometheus (dùng `prom-client`). Bắt buộc expose:

```
http_request_duration_seconds     (histogram, theo route)
webhook_processing_duration_seconds
bullmq_job_failed_total           (theo queue name)
bullmq_queue_backlog_size         (theo queue name)
```

Chỉ cần chứng minh scrape được (curl `/metrics` trả đúng format) — chưa dựng Grafana dashboard thật ở MVP, đó là việc của giai đoạn vận hành thật sau này.

## 4. Distributed tracing — hoãn lại

OpenTelemetry/Tempo hoãn lại: modular monolith là một process duy nhất, chưa có nhiều service độc lập để trace xuyên qua. Log context (`organizationId` + `requestId` sinh mỗi request, gắn vào mọi log entry trong cùng request) đã đủ để lần theo một request trong phạm vi một process.

## 5. Backup & retention (MVP)

- **Database backup:** cron `pg_dump` container/service riêng trong Docker Compose, chạy hàng ngày, nén, ghi ra volume `./backups` gắn ngoài container Postgres; giữ **7 bản gần nhất** (rotate, xóa bản cũ hơn), phục vụ demo/khôi phục thủ công — không cần WAL streaming/PITR thật ở quy mô MVP.
- **Log retention:** log JSON ra stdout, Docker daemon giới hạn qua `max-size: 10m, max-file: 5` (log driver `json-file`) — không dùng aggregation service riêng ở MVP (Loki hoãn lại, xem mục ngoài phạm vi).
- **Data retention/xóa theo yêu cầu:** chưa có tự động hoá; xử lý thủ công qua truy vấn trực tiếp khi có yêu cầu hợp lệ (out of scope tự động hoá compliance ở MVP, xem OVERVIEW mục 16).

## 6. Ngoài phạm vi

- Grafana dashboard, Loki log aggregation, Tempo distributed tracing — thêm khi tách microservices hoặc triển khai production thật.
- Alerting (PagerDuty/Slack) cho webhook error rate, queue backlog — tài liệu gốc mục 20, cần khi có on-call thật.
- Kubernetes — modular monolith + Docker Compose là đủ (tài liệu gốc mục 9.4 loại khỏi phạm vi).
- Point-in-time recovery/WAL streaming thật, backup off-site/multi-region — thêm khi lên production thật ngoài phạm vi đề tài.

## 7. Câu hỏi mở (không chặn implementation)

- `requestId` sinh ở tầng nào (middleware NestJS hay từ header `X-Request-Id` nếu có sẵn từ reverse proxy)?
