import {
  COPILOT_NO_INVOICE_LABEL,
  COPILOT_RECEIVABLE_FIELD_ALIASES,
  COPILOT_RECEIVABLE_FIELDS,
  type CopilotReceivableField,
} from './copilot-receivable-labels';

describe('COPILOT_RECEIVABLE_FIELD_ALIASES', () => {
  it('lists the canonical label first for every field', () => {
    for (const [field, labels] of Object.entries(
      COPILOT_RECEIVABLE_FIELD_ALIASES,
    ) as [CopilotReceivableField, readonly string[]][]) {
      expect(labels[0]).toBe(COPILOT_RECEIVABLE_FIELDS[field]);
    }
  });

  it('offers the lowercase and alternate spellings the model drifts into', () => {
    expect(COPILOT_RECEIVABLE_FIELD_ALIASES.invoice).toEqual(
      expect.arrayContaining(['Số hoá đơn:', 'Hoá đơn:']),
    );
    expect(COPILOT_RECEIVABLE_FIELD_ALIASES.due).toEqual(
      expect.arrayContaining(['Ngày đáo hạn:', 'Đến hạn:', 'Hạn:']),
    );
  });

  it('gives every field at least one wordable so a row can never lose a value', () => {
    for (const labels of Object.values(COPILOT_RECEIVABLE_FIELD_ALIASES)) {
      for (const label of labels) expect(label.endsWith(':')).toBe(true);
    }
  });
});

describe('COPILOT_NO_INVOICE_LABEL', () => {
  it('is the placeholder the prompt tells the model to write', () => {
    expect(COPILOT_NO_INVOICE_LABEL).toBe('Chưa có số hóa đơn');
  });
});
