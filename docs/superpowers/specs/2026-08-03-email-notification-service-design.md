# Email / Notification Service Design

> Child spec of [docs/overview.md](../../../docs/overview.md), dependent on [2026-08-03-reminder-automation-design.md](2026-08-03-reminder-automation-design.md) (`ReminderExecution`) and [2026-08-03-collection-copilot-design.md](2026-08-03-collection-copilot-design.md) (sending reminders through chat).

## 1. EmailProviderAdapter & send flow

```
EmailProviderAdapter (interface)
  send(to, subject, html, metadata): Promise<{ providerMessageId }>

ResendEmailAdapter implements EmailProviderAdapter   // the only actual implementation for the MVP,
                                                       // do not prebuild unused SES/SendGrid adapters (YAGNI)

EmailService
  sendReminderEmail({ receivableId, templateId, reminderExecutionId }):
    1. Render EmailTemplate with variables (customerName, invoiceNumber, remainingAmount,
       dueDate, daysOverdue, organizationName)
    2. Enqueue into "email-queue" (BullMQ); do not call adapter.send() directly in the request
    3. Worker processes the job: call adapter.send(...), update the correct ReminderExecution
       using reminderExecutionId, and store providerMessageId
```

`EmailProviderAdapter` isolates domain logic from a specific provider—switching from Resend later only requires a new implementation; `EmailService` and callers do not change.

`reminderExecutionId` is required so the email worker updates the execution for the current send. Do not infer the execution only from `receivableId` and `templateId`, because a receivable may be reminded multiple times.

## 2. Retry & failure handling

```
email-queue job config:
  attempts: 3, backoff: { type: 'exponential', delay: 5000 }
```

If all three attempts fail, move the job to the Dead Letter Queue and set `ReminderExecution.status = FAILED` (`FAILED` is a technical sending error, unlike `SKIPPED`, which is a business decision such as paid/disputed; see section 3 of [2026-08-03-reminder-automation-design.md](2026-08-03-reminder-automation-design.md)). Show it in the UI so accounting can handle it manually (for example, by calling the customer).

Set `ReminderExecution.status = SENT` only after `adapter.send()` succeeds (`providerMessageId` is returned), not when the job is enqueued; this prevents reporting "sent" while it is queued or has already failed.

## 3. Out of scope

- Open/click tracking and Resend bounce/complaint webhooks—later extension (listed as an open question in section 22 of the original document).
- A custom sending domain per organization—Enterprise feature, outside the MVP.
- Notification channels other than email (Zalo OA, SMS, Teams, Slack).

## 4. Open questions (do not block implementation)

- Should a Resend bounce/complaint webhook automatically mark a customer's email invalid to prevent further sends, or should this remain manual in the MVP?
- Should `email-queue` be separate from the CASSO webhook queue (different priority), or is a shared Redis instance sufficient?
