import { hasDisallowedHandlebarsVariable } from './email-template-variables.validator';

describe('hasDisallowedHandlebarsVariable', () => {
  it('allows a template using all 7 allowed variables', () => {
    const value =
      'Xin chào {{customerName}}, hóa đơn {{invoiceNumber}} số tiền gốc {{originalAmount}}, ' +
      'còn lại {{remainingAmount}}, hạn thanh toán {{dueDate}}, quá hạn {{daysOverdue}} ngày. ' +
      'Trân trọng, {{organizationName}}.';

    expect(hasDisallowedHandlebarsVariable(value)).toBe(false);
  });

  it('rejects an unknown variable name', () => {
    expect(hasDisallowedHandlebarsVariable('Hi {{someRandomVariable}}')).toBe(
      true,
    );
  });

  it('rejects triple-stash syntax even for an allowed variable', () => {
    expect(hasDisallowedHandlebarsVariable('Hi {{{customerName}}}')).toBe(true);
  });

  it('allows plain text with no Handlebars tokens', () => {
    expect(
      hasDisallowedHandlebarsVariable('Hello there, no variables here'),
    ).toBe(false);
  });
});
