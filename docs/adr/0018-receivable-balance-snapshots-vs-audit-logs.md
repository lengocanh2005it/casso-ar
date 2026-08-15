# Receivable Balance Snapshots vs Audit Logs

**Status:** accepted

Keep `ReceivableBalanceHistory` and `AuditLog` as separate domain concepts. Balance
history is the immutable financial snapshot source for historical outstanding and may
carry minimal transition provenance; `AuditLog` records actors, actions, and before/after
state across the product. Neither replaces the other, and historical balances must not
be reconstructed from audit logs. Balance history is a snapshot log, not an
event-sourced ledger or replay system.
