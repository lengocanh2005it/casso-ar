import { buildDefaultEmailTemplates } from './seed-default-email-templates';

describe('buildDefaultEmailTemplates', () => {
  const templates = buildDefaultEmailTemplates('org-1', new Date());

  it('ships a branded table-based shell for every default template', () => {
    for (const template of templates) {
      expect(template.bodyHtml).toContain('<table');
      expect(template.bodyHtml).toContain('role="presentation"');
      expect(template.bodyHtml).toContain('{{organizationName}}');
    }
  });

  it('uses a fluid email canvas that fits narrow previews', () => {
    for (const template of templates) {
      expect(template.bodyHtml).toContain('width="100%"');
      expect(template.bodyHtml).toContain('max-width:600px');
      expect(template.bodyHtml).not.toContain('width="600"');
    }
  });

  it('keeps the four seeded reminder stages wired to their rules', () => {
    expect(templates.map((t) => t.reminderStage)).toEqual([
      'Nhắc trước hạn 3 ngày',
      'Nhắc quá hạn 1 ngày',
      'Nhắc quá hạn 7 ngày',
      'Nhắc quá hạn 30 ngày',
    ]);
  });

  it('surfaces the amount as a right-aligned figure rather than a sentence', () => {
    const preDue = templates[0];
    expect(preDue.bodyHtml).toContain('Còn phải thu');
    expect(preDue.bodyHtml).toContain('{{remainingAmount}}');
    expect(preDue.bodyHtml).toContain('align="right"');
  });

  it('only uses the seven allowed Handlebars variables', () => {
    const allowed = new Set([
      'customerName',
      'invoiceNumber',
      'originalAmount',
      'remainingAmount',
      'dueDate',
      'daysOverdue',
      'organizationName',
    ]);

    for (const template of templates) {
      for (const [, name] of template.bodyHtml.matchAll(
        /\{\{\s*([A-Za-z]\w*)\s*\}\}/g,
      )) {
        expect(allowed.has(name)).toBe(true);
      }
    }
  });

  it('never emits a triple-brace unescaped token', () => {
    for (const template of templates) {
      expect(template.bodyHtml).not.toContain('{{{');
    }
  });
});
