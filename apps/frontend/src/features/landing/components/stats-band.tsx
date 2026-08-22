import { ArrowLeftRight, BellRing, Clock3, ListChecks } from 'lucide-react';
import { LANDING_STAT_HIGHLIGHTS } from '../landing-data';

const HIGHLIGHT_ICONS = [ArrowLeftRight, ListChecks, BellRing, Clock3] as const;

export function StatsBand() {
  return (
    <section aria-labelledby="stats-band-title" className="py-10 sm:py-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="rounded-3xl bg-primary px-6 py-10 text-primary-foreground shadow-lg shadow-primary/15 dark:text-white sm:px-12 sm:py-12">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="stats-band-title"
              className="text-3xl font-bold tracking-tight sm:text-4xl"
            >
              Vì sao chọn Casso Ledger?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/80 text-pretty dark:text-white/80">
              Những công cụ giúp bạn thu tiền đúng hạn và giảm thao tác thủ
              công.
            </p>
          </div>

          <div className="mx-auto mt-12 grid grid-cols-2 gap-y-10 lg:grid-cols-4 lg:divide-x lg:divide-primary-foreground/20">
            {LANDING_STAT_HIGHLIGHTS.map((highlight, index) => {
              const Icon = HIGHLIGHT_ICONS[index];

              return (
                <div
                  key={highlight.label}
                  className="flex flex-col items-center gap-3 px-4 text-center lg:px-8"
                >
                  <div className="flex size-12 items-center justify-center rounded-xl border border-primary-foreground/20 bg-primary-foreground/10">
                    <Icon className="size-6" aria-hidden="true" />
                  </div>
                  <p className="max-w-[16rem] text-base leading-relaxed text-primary-foreground/90 dark:text-white/90">
                    {highlight.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
