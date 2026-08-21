# Email Template Attachments Design

> Child spec of [2026-08-03-email-template-management-design.md](2026-08-03-email-template-management-design.md) (adds attachments to `EmailTemplate`) and [2026-08-03-email-notification-service-design.md](2026-08-03-email-notification-service-design.md) (adds attachments to the send flow). Implements [issue #275](https://github.com/lengocanh2005it/casso-ledger/issues/275). Design settled interactively via `grilling` on 2026-08-21; this file is the durable record of that session.

## 1. Scope

A business attaches files to a saved `EmailTemplate`. Every reminder sent using that template automatically carries the attachments — there is no per-send, ad-hoc compose flow (none exists in the current architecture; reminders always resolve a `templateId`, see parent spec §1). Attachments persist until the template is deleted or the business removes one explicitly; they are not scoped to a single send.

## 2. Entity

```
EmailTemplateAttachment
  id, organizationId, emailTemplateId,
  filename (original name — display + cid: match only, never used as a path),
  storageKey (path on disk, random — never derived from filename),
  mimeType, sizeBytes, createdAt
```

No `isInline` column. Inline vs. downloadable is decided at render time (§4), not stored.

## 3. Limits (hardcoded constants, not per-org config)

- Max 5 files per template
- Max 10MB per file
- Max 25MB total per template
- Allowed MIME types this phase: `application/pdf`, `image/png`, `image/jpeg`. DOCX/XLSX are an explicit follow-up (same validation path extends trivially — not a redesign).

## 4. Inline images via CID

Author writes `<img src="cid:original-filename.png">` directly in `bodyHtml` — no new Handlebars helper. At send time: an attachment is inline (`contentId = filename`) iff its `filename` appears as `cid:<filename>` in the rendered `bodyHtml`; otherwise it ships as a normal downloadable attachment. The same file can be both.

## 5. Storage

Local disk, under a path scoped by `organizationId` and `emailTemplateId`: `uploads/email-template-attachments/<organizationId>/<emailTemplateId>/<uuid>.<ext>`, shared via a Docker Compose volume between the API and worker containers. No S3/MinIO — no multi-instance deployment exists yet to justify it (YAGNI; revisit if deployment moves off single-host Compose).

On-disk filenames are always a generated UUID + extension, never the original filename — avoids path traversal and overwrite collisions. The original `filename` is DB metadata only.

## 6. Queue wiring

`ReminderEmailJob` carries attachment *references* (`storageKey`, `filename`, `mimeType`) — never base64 content — to avoid bloating the BullMQ/Redis job payload (a 10MB file would be ~13MB base64). `EmailQueueProcessor` re-validates each referenced file still exists on disk before sending, mirroring the scan/re-check split already established for reminder executions (ADR-0004), then reads it, base64-encodes it, and calls the adapter with `EmailAttachment[]` — a type both `ResendEmailAdapter` and `SmtpEmailAdapter` already accept.

## 7. API

```
POST   /api/v1/email-templates/:id/attachments              → upload a file (multipart), Permission: REMINDER_POLICY_WRITE
DELETE /api/v1/email-templates/:id/attachments/:attachmentId → remove one, Permission: REMINDER_POLICY_WRITE
```

Reuses the existing template permission — no new RBAC permission. Response DTO exposes only `id`, `filename`, `mimeType`, `sizeBytes`, `createdAt` — never `storageKey` or `organizationId`.

## 8. Errors

Invalid MIME type, oversize file, and count/total-size limit exceeded all reuse `ErrorCode.VALIDATION_ERROR` (400) with a Vietnamese message — consistent with `upload-avatar.usecase.ts`. One new code: `ErrorCode.ATTACHMENT_NOT_FOUND` (404), following the existing per-entity `*_NOT_FOUND` convention.

## 9. Tenant isolation

`EmailTemplateAttachment` is fetched only through the org-scoped repository (`BaseRepository`); an attachment ID from another organization resolves as not-found, matching how `EmailTemplate` itself is tenant-scoped. Delete also checks `attachment.emailTemplateId` matches the template in the URL, catching an attachment that exists in the same org but under a different template.

## 10. Branding rule (unaffected)

Organization → customer emails never get the Casso Ledger logo auto-attached (existing rule). Nothing here touches `buildCassoEmail`/logo logic — attachments are independent of branding.

## 11. Out of scope

- Per-send / ad-hoc attachments not tied to a saved template — no compose-and-send-now flow exists; adding one is a separate, larger feature.
- DOCX/XLSX support — fast-follow once PDF/PNG/JPEG ships.
- Per-organization configurable limits — constants for MVP; add an org settings column when a real request for it appears.
- S3/MinIO or any object storage — local disk is sufficient for the current single-host Docker Compose deployment.
- Attachment versioning/history — replacing a file is delete + re-upload, no diffing or revision log.
