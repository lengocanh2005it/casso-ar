import { CheckCircle2 } from 'lucide-react';
import { LANDING_ABOUT } from '../landing-data';

export function AboutSection() {
  return (
    <section id="gioi-thieu" className="scroll-mt-24 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <p className="text-lg leading-relaxed text-muted-foreground text-pretty">
          {LANDING_ABOUT.paragraph}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
          {LANDING_ABOUT.pillars.map((pillar) => (
            <div
              key={pillar.label}
              className="flex items-center gap-2 text-sm font-medium"
            >
              <CheckCircle2 className="size-4 text-primary" />
              {pillar.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
