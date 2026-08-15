# Receivable Balance History Rollout Baseline

**Status:** accepted

Receivable balance history begins with one `ROLLOUT_BASELINE` snapshot for every
existing receivable during a brief maintenance window. Cutoffs before that baseline
are unknown rather than reconstructed, while new balance transitions append normal
snapshots afterward. This prevents partial historical outstanding totals without
adding a zero-downtime cutover mechanism; archival is a separate future decision.
The baseline is idempotent per receivable and rollout so an interrupted run can resume
without duplicating snapshots.
The migration also records one `coveredFrom` epoch per organization with reason
`HISTORY_COVERAGE_START`; the historical query ignores rows before that boundary.
For the MVP, the migration explicitly runs as one atomic transaction and takes a
`SHARE` lock on `receivables` before reading. In-flight transitions finish first;
new amount/status writes wait until the cutover commits. Failure rolls back the
full baseline and does not establish coverage.
The current model has one history coverage epoch per organization; any future
re-baseline would require an explicit new epoch.
