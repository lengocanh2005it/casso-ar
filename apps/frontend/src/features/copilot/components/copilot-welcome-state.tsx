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
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8 text-center sm:py-12">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
        <Sparkles className="size-6" aria-hidden="true" />
      </div>
      <div>
        <h2 className="text-base font-semibold">Hỏi Copilot về công nợ</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Copilot có thể tra cứu công nợ, lịch sử thanh toán và soạn email nhắc
          thanh toán.
        </p>
      </div>
      <div className="flex w-full max-w-xl flex-col gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSuggestionClick(suggestion)}
            className="rounded-lg border bg-card px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-violet-200 hover:bg-violet-500/5 hover:text-foreground dark:hover:border-violet-800"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
