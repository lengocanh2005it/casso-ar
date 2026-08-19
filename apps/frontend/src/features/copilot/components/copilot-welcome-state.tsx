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
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="size-6" aria-hidden="true" />
      </div>
      <div>
        <h2 className="text-base font-semibold">Hỏi Copilot về công nợ</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Copilot có thể tra cứu công nợ, lịch sử thanh toán và soạn email nhắc
          thanh toán.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSuggestionClick(suggestion)}
            className="rounded-lg border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
