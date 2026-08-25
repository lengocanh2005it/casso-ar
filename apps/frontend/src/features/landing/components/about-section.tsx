import { CheckCircle2 } from 'lucide-react';
import { LANDING_ABOUT } from '../landing-data';
import { AboutDemoCard } from './about-demo-card';

export function AboutSection() {
  return (
    <section id="gioi-thieu" className="scroll-mt-24 py-14 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Giới thiệu
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Theo dõi toàn bộ dòng tiền và công nợ trên cùng một luồng làm việc.
          </p>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div className="space-y-6">
            <p className="text-lg leading-relaxed text-muted-foreground text-pretty">
              {LANDING_ABOUT.paragraphSegments.map((segment) =>
                'bold' in segment && segment.bold ? (
                  <strong
                    key={segment.text}
                    className={
                      segment.text === 'Casso AR'
                        ? 'font-semibold text-primary'
                        : 'font-semibold text-foreground'
                    }
                  >
                    {segment.text}
                  </strong>
                ) : (
                  segment.text
                ),
              )}
            </p>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {LANDING_ABOUT.pillars.map((pillar) => (
                <div
                  key={pillar.label}
                  className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3"
                >
                  <CheckCircle2
                    className="size-5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium">{pillar.label}</span>
                </div>
              ))}
            </div>
          </div>
          <AboutDemoCard />
        </div>
      </div>
    </section>
  );
}
