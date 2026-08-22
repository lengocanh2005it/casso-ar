import { Sparkles } from 'lucide-react';

const SUGGESTIONS = [
  'Khách hàng nào đang có công nợ cao nhất?',
  'Khách hàng nào đang có công nợ quá hạn?',
  'Soạn email nhắc thanh toán cho hoá đơn quá hạn',
];

export function CopilotWelcomeState({
  onSuggestionClick,
}: {
  onSuggestionClick: (text: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-8 text-center sm:py-12">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <Sparkles className="size-6" aria-hidden="true" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          BẮT ĐẦU TỪ MỘT CÂU HỎI
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">
          Hỏi Copilot về công nợ
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Copilot có thể tra cứu công nợ, lịch sử thanh toán và soạn email nhắc
          thanh toán.
        </p>
      </div>
      <div className="grid w-full max-w-3xl gap-3 sm:grid-cols-3">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSuggestionClick(suggestion)}
            className="min-h-24 rounded-xl border border-border bg-background px-3.5 py-3 text-left text-sm leading-5 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
