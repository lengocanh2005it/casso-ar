import { EmailTemplate } from '../domain/email-template';
import { RenderEmailTemplateUseCase } from './render-email-template.usecase';

function buildTemplate(subject: string, bodyHtml: string): EmailTemplate {
  return new EmailTemplate({
    id: 'tpl-1',
    organizationId: 'org-1',
    name: 'Test template',
    subject,
    bodyHtml,
    reminderStage: null,
    isDefault: false,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
  });
}

describe('RenderEmailTemplateUseCase', () => {
  const useCase = new RenderEmailTemplateUseCase();

  it('substitutes all 7 fixed variables into subject and bodyHtml', () => {
    const template = buildTemplate(
      'Invoice {{invoiceNumber}} — {{organizationName}}',
      '<p>{{customerName}}, owes {{remainingAmount}} / {{originalAmount}}, due {{dueDate}}, {{daysOverdue}} days overdue</p>',
    );

    const result = useCase.render(template, {
      customerName: 'Company B',
      invoiceNumber: 'INV-001',
      originalAmount: 100,
      remainingAmount: 40,
      dueDate: '2026-08-10',
      daysOverdue: 5,
      organizationName: 'Casso Ledger',
    });

    expect(result.subject).toBe('Invoice INV-001 — Casso Ledger');
    expect(result.bodyHtml).toBe(
      '<p>Company B, owes 40 / 100, due 2026-08-10, 5 days overdue</p>',
    );
  });

  it('HTML-escapes variable values to prevent XSS (e.g. a customerName imported from Excel)', () => {
    const template = buildTemplate(
      'Hello {{customerName}}',
      '<p>{{customerName}}</p>',
    );

    const result = useCase.render(template, {
      customerName: '<script>alert(1)</script>',
      invoiceNumber: 'INV-001',
      originalAmount: 100,
      remainingAmount: 40,
      dueDate: '2026-08-10',
      daysOverdue: 5,
      organizationName: 'Casso Ledger',
    });

    expect(result.subject).toBe('Hello &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result.bodyHtml).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
  });
});
