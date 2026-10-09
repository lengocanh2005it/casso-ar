---
Status: accepted
---
# Exact report amounts are decimal strings in API v1

Report endpoints expose all VND amount fields as base-10 integer strings at every size, so aggregates remain exact and a field's JSON type does not depend on its value. Update the existing `/api/v1` response fields in place and update OpenAPI schemas and the first-party frontend in the same change. The receivable balance-history list must select a stored `bigint` snapshot as text before the process-wide PostgreSQL parser can convert it to a JavaScript number; keep that parser unchanged for other application code. Chart geometry may use scaled numeric values, while displayed report amounts and tooltips remain exact. This intentionally changes response types; supporting independently deployed clients would require a separate compatibility plan.

## Considered options

- Keep numeric fields and return a documented error when a total exceeds JavaScript's safe integer range. Rejected because the report would stop returning a valid total.
- Return numbers below the safe integer limit and strings above it. Rejected because a field's runtime type would vary by value.
- Introduce a new API version or parallel fields. Deferred because the known consumer is the first-party frontend in this repository.
- Change the process-wide PostgreSQL `bigint` parser. Rejected for this issue because report queries can preserve their direct snapshot values locally without changing number-based domain arithmetic elsewhere.
