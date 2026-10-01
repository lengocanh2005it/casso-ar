import { FileText, Wallet } from 'lucide-react';
import { renderHighlighted } from './copilot-highlight';

export interface CopilotReceivableRow {
  customerName: string;
  invoiceNumber: string | null;
  remainingAmount: string;
  dueDate: string;
}

/**
 * The model writes the amount in whatever shape it feels like — "13000000",
 * "13,000,000", "13.000.000 VNĐ" — so normalise it here instead of trusting
 * the prompt. VND never has a fractional part, so drop the decimals rather
 * than rendering "13.000.000,00".
 */
const VND_FORMAT = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

function formatAmount(value: string): string {
  const digits = /\d[\d.,\s]*/.exec(value)?.[0].replaceAll(/\D/g, '');
  if (!digits) return value.trim();
  return VND_FORMAT.format(Number(digits));
}

/**
 * The model's numbered list runs to a single long line per customer, which
 * wraps badly and hides the invoice number behind the sidebar. Split the same
 * figures into labelled fields so every value stays readable and wrapped.
 */
export function CopilotReceivableList({
  rows,
}: {
  rows: CopilotReceivableRow[];
}) {
  if (rows.length === 0) return null;

  return (
    <ul className="mt-1 grid gap-2">
      {rows.map((row, index) => (
        <li
          key={`${row.customerName}-${row.invoiceNumber ?? 'no-invoice'}-${row.remainingAmount}-${row.dueDate}`}
          className="rounded-lg border border-border/70 bg-background/60 px-3 py-2.5"
        >
          <p className="text-sm font-medium leading-5 text-foreground">
            <span className="mr-1.5 text-xs font-semibold text-muted-foreground">
              {index + 1}.
            </span>
            {renderHighlighted(row.customerName, `n${index}`)}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <FileText aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="shrink-0">Hoá đơn:</span>
              <span className="min-w-0 break-words font-medium text-foreground">
                {row.invoiceNumber
                  ? renderHighlighted(row.invoiceNumber, `i${index}`)
                  : 'Chưa có số hoá đơn'}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Wallet aria-hidden="true" className="size-3.5 shrink-0" />
              <span>Còn lại:</span>
              <span className="font-semibold text-primary">
                {renderHighlighted(
                  formatAmount(row.remainingAmount),
                  `a${index}`,
                )}
              </span>
            </span>
            {row.dueDate && (
              <span className="inline-flex items-center gap-1.5">
                <span>Hạn:</span>
                <span className="font-medium text-foreground">
                  {renderHighlighted(row.dueDate, `d${index}`)}
                </span>
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
