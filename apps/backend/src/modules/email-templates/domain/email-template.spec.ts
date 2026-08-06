import { EmailTemplate } from './email-template';

function buildTemplate(
  overrides: Partial<ConstructorParameters<typeof EmailTemplate>[0]> = {},
): EmailTemplate {
  return new EmailTemplate({
    id: 'tpl-1',
    organizationId: 'org-1',
    name: '1 Day Overdue Reminder',
    subject: 'Invoice {{invoiceNumber}} is overdue',
    bodyHtml: '<p>Dear {{customerName}}</p>',
    reminderStage: '1 Day Overdue Reminder',
    isDefault: true,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...overrides,
  });
}

describe('EmailTemplate domain entity', () => {
  it('creates a template with the provided fields', () => {
    const template = buildTemplate();

    expect(template.name).toBe('1 Day Overdue Reminder');
    expect(template.isDefault).toBe(true);
    expect(template.reminderStage).toBe('1 Day Overdue Reminder');
  });

  it('updateContent returns a new instance with subject/bodyHtml replaced and updatedAt refreshed', () => {
    const template = buildTemplate({
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    const updated = template.updateContent(
      'Hello {{customerName}}',
      '<p>New content</p>',
    );

    expect(updated.subject).toBe('Hello {{customerName}}');
    expect(updated.bodyHtml).toBe('<p>New content</p>');
    expect(updated.updatedAt.getTime()).toBeGreaterThan(
      template.updatedAt.getTime(),
    );
    // original instance is unchanged (immutable domain object)
    expect(template.subject).toBe('Invoice {{invoiceNumber}} is overdue');
  });

  it('allows updateContent even when isDefault is true (content editable, row not deletable)', () => {
    const template = buildTemplate({ isDefault: true });

    const updated = template.updateContent('New hello', '<p>New</p>');

    expect(updated.isDefault).toBe(true);
  });
});
