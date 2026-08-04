# Aging Dashboard & Reporting Design

> Spec con của [docs/overview.md](../../../docs/overview.md), phụ thuộc [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) (`Receivable.status`, `dueDate`, `remainingAmount`) và [2026-08-03-webhook-matching-engine-design.md](2026-08-03-webhook-matching-engine-design.md) (auto-match rate). Định nghĩa cách tính các con số hiển thị trên Dashboard/Báo cáo (tài liệu gốc mục 7.11, 15, 19).

## 1. Nguyên tắc: real-time, không precompute
