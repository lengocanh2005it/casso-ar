import { ArrowLeftRight, BellRing, Clock3 } from 'lucide-react';

const PILLARS = [
  {
    icon: ArrowLeftRight,
    title: 'Đối chiếu tự động',
    description: 'Khớp từng khoản tiền về với đúng công nợ.',
  },
  {
    icon: BellRing,
    title: 'Nhắc nợ đúng lúc',
    description: 'Hệ thống tự gửi nhắc nhở theo lịch bạn đặt.',
  },
  {
    icon: Clock3,
    title: 'Báo cáo tuổi nợ',
    description: 'Biết ngay khoản nào sắp quá hạn, quá hạn bao lâu.',
  },
] as const;

export function AuthPromiseAside() {
  return (
    <aside
      aria-label="Casso AR giải quyết gì"
      className="hidden w-full max-w-sm text-left lg:block"
    >
      <p className="text-sm font-semibold tracking-wide text-primary uppercase">
        Quản lý &amp; thu hồi công nợ
      </p>
      <p className="mt-3 text-2xl font-bold tracking-tight text-balance text-foreground">
        Giao dịch về tới đâu, đối chiếu công nợ tới đó.
      </p>
      <ul className="mt-8 space-y-5">
        {PILLARS.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <li key={pillar.title} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10"
              >
                <Icon className="size-4 text-primary" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">
                  {pillar.title}
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {pillar.description}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
