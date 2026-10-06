# Deterministic lock order for payment allocation

**Status:** Accepted

Allocation and undo transactions acquire shared financial rows in `Receivable → Payment` order. Undo may lock its allocation row first, and manual matching may lock its bank transaction first; manual matching then locks each distinct receivable by ascending lowercase UUID before applying allocations in request order. Each match remains atomic in its own transaction; batch matches continue to process items independently as recorded in ADR 0016. This policy does not add deadlock retries.

Regression coverage combines deterministic unit assertions for lock-call order with barrier-started PostgreSQL concurrency tests. The database tests race a new allocation against undo of an existing allocation on the same payment and receivable, then race two manual matches over the same receivables in reverse request order with sufficient balance for both to succeed. A PostgreSQL failure-injection check throws after the allocation row, rollups, balance-history snapshot, and both ledger events have been written inside a transaction but before commit; none may persist.
