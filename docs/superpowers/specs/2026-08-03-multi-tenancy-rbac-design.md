# Multi-tenancy + RBAC Design

> Spec con của [docs/overview.md](../../../docs/overview.md). Nền tảng mà mọi spec khác ([Domain Core](2026-08-03-domain-core-design.md), [Webhook/Matching](2026-08-03-webhook-matching-engine-design.md), [Cas ID](2026-08-03-cas-id-bank-connection-design.md), [Reminder](2026-08-03-reminder-automation-design.md)) dựa vào cho tenant isolation và phân quyền.

## 1. Tenant isolation model
