# Dispute Management Design

> Spec con của [docs/overview.md](../../../docs/overview.md), sửa đổi [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) — thay `Receivable.isDisputed` (field lưu trực tiếp) bằng entity `Dispute` riêng + computed field, và ảnh hưởng tới [2026-08-03-reminder-automation-design.md](2026-08-03-reminder-automation-design.md) (điều kiện bỏ qua reminder).

## 1. Entity Dispute
