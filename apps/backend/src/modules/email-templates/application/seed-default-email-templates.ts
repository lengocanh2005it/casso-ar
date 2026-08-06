import { randomUUID } from 'node:crypto';
import { EmailTemplate } from '../domain/email-template';

interface DefaultTemplateDefinition {
  name: string;
  reminderStage: string;
  subject: string;
  bodyHtml: string;
}

const DEFAULT_TEMPLATE_DEFINITIONS: DefaultTemplateDefinition[] = [
  {
    name: '3 Day Pre-Due Reminder',
    reminderStage: '3 Day Pre-Due Reminder',
    subject: 'Payment reminder for invoice {{invoiceNumber}}',
    bodyHtml:
      '<p>Dear {{customerName}},</p>' +
      '<p>Invoice {{invoiceNumber}} with remaining amount {{remainingAmount}} is due on {{dueDate}}. ' +
      'Please arrange payment by the due date.</p>' +
      '<p>Sincerely,<br/>{{organizationName}}</p>',
  },
  {
    name: '1 Day Overdue Reminder',
    reminderStage: '1 Day Overdue Reminder',
    subject: 'Invoice {{invoiceNumber}} is overdue for payment',
    bodyHtml:
      '<p>Dear {{customerName}},</p>' +
      '<p>Invoice {{invoiceNumber}} is {{daysOverdue}} days overdue for payment, with remaining amount {{remainingAmount}}. ' +
      'Please make payment as soon as possible.</p>' +
      '<p>Sincerely,<br/>{{organizationName}}</p>',
  },
  {
    name: '7 Day Overdue Reminder',
    reminderStage: '7 Day Overdue Reminder',
    subject:
      'Reminder 2: Invoice {{invoiceNumber}} is {{daysOverdue}} days overdue',
    bodyHtml:
      '<p>Dear {{customerName}},</p>' +
      '<p>Invoice {{invoiceNumber}} is now {{daysOverdue}} days overdue, with remaining amount {{remainingAmount}}. ' +
      'This is the second reminder; please complete payment soon.</p>' +
      '<p>Sincerely,<br/>{{organizationName}}</p>',
  },
  {
    name: '30 Day Overdue Reminder',
    reminderStage: '30 Day Overdue Reminder',
    subject:
      'Urgent: Invoice {{invoiceNumber}} is {{daysOverdue}} days overdue',
    bodyHtml:
      '<p>Dear {{customerName}},</p>' +
      '<p>Invoice {{invoiceNumber}} is {{daysOverdue}} days overdue for payment, with remaining amount {{remainingAmount}}. ' +
      'Please contact {{organizationName}} accounts receivable as soon as possible to resolve this.</p>' +
      '<p>Sincerely,<br/>{{organizationName}}</p>',
  },
];

export function buildDefaultEmailTemplates(
  organizationId: string,
  now: Date,
): EmailTemplate[] {
  return DEFAULT_TEMPLATE_DEFINITIONS.map(
    (definition) =>
      new EmailTemplate({
        id: randomUUID(),
        organizationId,
        name: definition.name,
        subject: definition.subject,
        bodyHtml: definition.bodyHtml,
        reminderStage: definition.reminderStage,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      }),
  );
}
