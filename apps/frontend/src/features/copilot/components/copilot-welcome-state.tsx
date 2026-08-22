import { Sparkles } from 'lucide-react';

const SUGGESTIONS = [
  'Tóm tắt công nợ của khách hàng ABC Company',
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
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
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
            className="min-h-24 rounded-xl border border-primary/15 bg-card/80 px-3.5 py-3 text-left text-sm leading-5 text-muted-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5 hover:text-foreground hover:shadow-md dark:border-primary/25 dark:hover:border-primary/50"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
