import { ArrowLeftRight, BellRing, Clock3, ListChecks } from 'lucide-react';
import { LANDING_STAT_HIGHLIGHTS } from '../landing-data';

const HIGHLIGHT_ICONS = [ArrowLeftRight, ListChecks, BellRing, Clock3] as const;

export function StatsBand() {
  return (
    <section
      aria-labelledby="stats-band-title"
      className="border-y border-primary/30 bg-primary py-16 text-primary-foreground sm:py-20"
    >
      <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
        <h2
          id="stats-band-title"
          className="text-3xl font-bold tracking-tight sm:text-4xl"
        >
          Vì sao chọn Casso Ledger?
        </h2>
      </div>

      <div className="mx-auto mt-12 grid max-w-6xl grid-cols-2 gap-y-10 px-4 sm:px-6 lg:grid-cols-4 lg:divide-x lg:divide-primary-foreground/20">
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
              <p className="max-w-[16rem] text-base leading-relaxed text-primary-foreground/90">
                {highlight.label}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
