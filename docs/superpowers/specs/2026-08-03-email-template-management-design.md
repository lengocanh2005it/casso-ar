# Email Template Management Design

> Child spec of [docs/overview.md](../../../docs/overview.md) (section 7.6), dependent on [2026-08-03-reminder-automation-design.md](2026-08-03-reminder-automation-design.md) (`ReminderRule.emailTemplateId`) and [2026-08-03-email-notification-service-design.md](2026-08-03-email-notification-service-design.md) (the "Render EmailTemplate" step). Both specs use `EmailTemplate` without defining the entity; this spec fills that gap.

## 1. Entity

```
EmailTemplate
  id, organizationId, name, subject, bodyHtml (Handlebars template),
  reminderStage (nullable — only to display "which rule uses this template" in the UI,
                  display metadata only; the binding source of truth is ReminderRule.emailTemplateId),
  isDefault (boolean — marks a seeded system template; cannot be deleted, only edited),
  createdAt, updatedAt
```

There is no separate version table—edits use a direct `UPDATE` with no history (sufficient for the MVP and avoids over-engineering without a specific template-history audit requirement). If needed later, the `AuditLog` from [2026-08-03-exception-queue-audit-log-design.md](2026-08-03-exception-queue-audit-log-design.md) can add `EmailTemplate` to its tracked entities without changing this spec.

## 2. Default seed when creating an Organization

```
When signup creates an Organization (section 2 of 2026-08-03-authentication-onboarding-design.md):
  seed N EmailTemplate records (isDefault=true), each corresponding to one standard offsetDays milestone
  (for example, "Nhắc trước hạn 3 ngày", "Nhắc quá hạn 1 ngày", "Nhắc quá hạn 7 ngày", "Nhắc quá hạn 30 ngày" — Vietnamese, since reminderStage is UI-display text shown to Vietnamese-speaking users, not a matching key)
  → the new organization's default ReminderRules point emailTemplateId to these records
```

Accounting may edit the content of `isDefault=true` templates (change the tone) but cannot delete them—ensuring `ReminderRule` never points to a deleted `emailTemplateId`.

## 3. Variables & rendering (Handlebars)

```
EmailTemplate.bodyHtml: raw HTML + Handlebars {{variableName}} syntax
Fixed system variables (closed list; arbitrary variables are not allowed):
  {{customerName}}, {{invoiceNumber}}, {{originalAmount}}, {{remainingAmount}},
  {{dueDate}}, {{daysOverdue}}, {{organizationName}}

Render: Handlebars.compile(template.bodyHtml)(data) → automatically HTML-escape every variable
  (prevents XSS if customerName/invoiceNumber contains special characters imported from Excel)
```

`EmailService.sendReminderEmail` (designed in email-notification-service-design) performs this rendering before enqueueing. The existing flow does not change; this only defines the mechanism used by its "Render EmailTemplate" step.

## 4. API

```
GET    /api/v1/email-templates              → list the organization's templates
POST   /api/v1/email-templates              → create a new template (isDefault=false), Permission: REMINDER_POLICY_WRITE
PATCH  /api/v1/email-templates/:id          → edit subject/bodyHtml, Permission: REMINDER_POLICY_WRITE
DELETE /api/v1/email-templates/:id          → allowed only if isDefault=false AND no
                                        ReminderRule points to this emailTemplateId (409 if in use)
POST   /api/v1/email-templates/:id/preview  → render a preview with assumed sample data, returning
                                              { subject, bodyHtml } for display in the UI before saving,
                                              without sending a real email; Permission: REMINDER_POLICY_WRITE
```

## 5. Out of scope

- Drag-and-drop visual editor (drag-drop email builder)—a textarea/code editor for raw HTML is enough in the MVP; do not build a separate WYSIWYG editor.
- Multilingual templates (i18n by customer locale)—not mentioned in the original document and out of scope.
- Template versioning/edit history (see section 1).

## 6. Open questions (do not block implementation)

- Should the fixed system-variable list in section 3 be expanded (for example, `{{paymentLink}}` if an online payment portal is added), or are these seven variables enough for the MVP?
- Should `POST /email-templates/:id/preview` use hard-coded sample data or allow selecting a real Receivable for a preview with real data?
