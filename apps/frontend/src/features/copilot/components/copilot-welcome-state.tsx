import {
  ArrowUpRight,
  CircleDollarSign,
  Clock3,
  Mail,
  Sparkles,
} from 'lucide-react';

const SUGGESTIONS = [
  {
    question: 'Khách hàng nào đang có công nợ cao nhất?',
    detail: 'Ưu tiên khoản phải thu có giá trị lớn.',
    icon: CircleDollarSign,
  },
  {
    question: 'Khách hàng nào đang có công nợ quá hạn?',
    detail: 'Tìm khoản cần được nhắc thanh toán.',
    icon: Clock3,
  },
  {
    question: 'Soạn email nhắc thanh toán cho hoá đơn quá hạn',
    detail: 'Xem lại bản nháp trước khi gửi.',
    icon: Mail,
  },
];

export function CopilotWelcomeState({
  onSuggestionClick,
}: {
  onSuggestionClick: (text: string) => void;
}) {
  return (
    <div className="relative isolate flex flex-1 flex-col justify-center gap-4 overflow-x-clip rounded-3xl border border-primary/10 bg-gradient-to-br from-primary/5 via-background to-secondary/60 px-4 py-5 sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 -z-10 size-64 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="flex flex-col items-center text-center">
        <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-chart-2 text-primary-foreground shadow-lg shadow-primary/20 ring-8 ring-primary/5">
          <Sparkles className="size-6" aria-hidden="true" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          TRỢ LÝ THU HỒI
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
          Bạn muốn xử lý công nợ nào?
        </h2>
        <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
          Tra cứu khoản cần ưu tiên, xem tình trạng khách hàng hoặc soạn nháp
          nhắc thanh toán.
        </p>
      </div>

      <div className="w-full">
        <p className="mb-3 text-center text-xs font-medium text-muted-foreground">
          Gợi ý câu hỏi
        </p>
        <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SUGGESTIONS.map(({ question, detail, icon: Icon }) => (
            <button
              key={question}
              type="button"
              onClick={() => onSuggestionClick(question)}
              className="group flex min-h-20 items-start gap-3 rounded-2xl border border-border/80 bg-background/90 p-4 text-left shadow-sm shadow-primary/5 transition-[border-color,background-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/35 hover:bg-background hover:shadow-md hover:shadow-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-5 text-foreground">
                  {question}
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {detail}
                </span>
              </span>
              <ArrowUpRight
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-primary"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
