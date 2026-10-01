/**
 * The Copilot prompt tells the model which labels to write, and the frontend
 * parser reads those same labels back out of the model's prose. They have to
 * stay in step or a row silently falls back to a paragraph, so both sides
 * derive from this one list.
 */
export const COPILOT_RECEIVABLE_FIELDS = {
  invoice: 'Số hóa đơn:',
  amount: 'Số tiền còn lại:',
  due: 'Hạn thanh toán:',
} as const;

export type CopilotReceivableField = keyof typeof COPILOT_RECEIVABLE_FIELDS;

/**
 * Wordings the model drifts into anyway. The parser accepts all of them; only
 * the canonical form above is asked for in the prompt.
 */
export const COPILOT_RECEIVABLE_FIELD_ALIASES: Record<
  CopilotReceivableField,
  readonly string[]
> = {
  invoice: [
    COPILOT_RECEIVABLE_FIELDS.invoice,
    'Số hoá đơn:',
    'Hoá đơn:',
    'Hóa đơn:',
  ],
  amount: [COPILOT_RECEIVABLE_FIELDS.amount, 'Số tiền:'],
  due: [COPILOT_RECEIVABLE_FIELDS.due, 'Ngày đáo hạn:', 'Đến hạn:', 'Hạn:'],
};

export const COPILOT_NO_INVOICE_LABEL = 'Chưa có số hóa đơn';
