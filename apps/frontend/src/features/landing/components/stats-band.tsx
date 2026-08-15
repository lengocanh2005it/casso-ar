import { Sparkles } from 'lucide-react';
import { LANDING_STAT_HIGHLIGHTS } from '../landing-data';

export function StatsBand() {
  return (
    <section
      className="border-y border-border/60 bg-muted/20 py-12 sm:py-14"
      aria-label="Điểm nổi bật"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-4 sm:px-6 lg:grid-cols-4">
        {LANDING_STAT_HIGHLIGHTS.map((highlight) => (
          <div
            key={highlight.label}
            className="flex flex-col items-center gap-2 px-2 text-center"
          >
            <Sparkles className="size-5 text-primary" aria-hidden="true" />
            <p className="max-w-[16rem] text-base text-muted-foreground">
              {highlight.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
