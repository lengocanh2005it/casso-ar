# Exception Queue + Audit Log Design

> Spec con của [docs/overview.md](../../../docs/overview.md), phụ thuộc [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) (PaymentAllocation, overpayment rule) và [2026-08-03-webhook-matching-engine-design.md](2026-08-03-webhook-matching-engine-design.md) (BankTransaction, MatchingCandidate, threshold 60-89).

## 1. Exception Queue — API & concurrency
