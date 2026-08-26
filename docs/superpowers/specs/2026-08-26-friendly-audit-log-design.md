# Friendly Audit Log Display Design

## Goal

Make audit-log details readable for Vietnamese business users while preserving
the raw audit payload for integrity and copy/link actions.

## Scope

- Format date-only and date-time fields with the existing `vi-VN` formatters.
- Resolve customer and related receivable display names in one backend read
  operation per page, without changing immutable `beforeState`/`afterState`.
- Keep UUIDs available as secondary technical identifiers, but do not make them
  the primary visible label.
- Add entity-aware field labels and customer/receivable reference metadata.

## Data flow

`AuditLogsController` returns the immutable audit snapshots plus a presentation
`references` object produced by the application use case. The use case batches
customer IDs found in the page's snapshots and asks the tenant-scoped customer
repository for names. The frontend renders the reference label and keeps the
raw ID in a copyable tooltip when a reference exists.

If a referenced customer no longer exists, the UI uses a stable fallback label
and retains the raw ID. Historical snapshots are not rewritten; the first
iteration therefore resolves the current customer name at read time.

## Presentation rules

- `dueDate` is formatted as `dd/MM/yyyy`.
- `createdAt`, `closedAt`, `resolvedAt`, `allocatedAt`, and `deletedAt` are
  formatted as `HH:mm dd/MM/yyyy`.
- `id`, `organizationId`, and `version` are technical metadata; they remain
  copyable but use an explicit technical label or reduced visual priority.
- `customerId` displays the resolved customer name with a copyable UUID
  fallback/tooltip.
- Receivable `entityId` displays the receivable's business reference when
  available and keeps the UUID for copy/link.

## Testing

Frontend component tests cover date formatting, resolved customer labels, and
fallback behavior. Backend application tests cover tenant-scoped batch customer
resolution and missing-customer fallback. Existing UUID-truncation assertions
are updated to assert the new primary display while preserving copy behavior.
