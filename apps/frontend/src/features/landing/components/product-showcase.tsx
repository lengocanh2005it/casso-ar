import { motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { LANDING_SHOWCASE_SCREENS } from '../landing-data';

export function ProductShowcase() {
  const [activeId, setActiveId] = useState(LANDING_SHOWCASE_SCREENS[0].id);
  const reducedMotion = useReducedMotion();
  const active =
    LANDING_SHOWCASE_SCREENS.find((screen) => screen.id === activeId) ??
    LANDING_SHOWCASE_SCREENS[0];

  return (
    <section className="border-b border-border/60 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Xem Casso Ledger hoạt động
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Không phải mockup — đây là giao diện thật doanh nghiệp bạn sẽ dùng
            mỗi ngày.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Chọn màn hình Casso Ledger để xem"
          className="mx-auto mt-8 flex w-fit max-w-full flex-wrap items-center justify-center gap-1.5 rounded-full border border-border/70 bg-muted/40 p-1.5"
        >
          {LANDING_SHOWCASE_SCREENS.map((screen) => {
            const Icon = screen.icon;
            const isActive = screen.id === activeId;
            return (
              <button
                key={screen.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveId(screen.id)}
                className={cn(
                  'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground pointer-hover:hover:text-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {screen.tabLabel}
              </button>
            );
          })}
        </div>

        <motion.div
          key={active.id}
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="mt-8"
        >
          <div className="mx-auto max-w-2xl text-center">
            <h3 className="text-xl font-semibold text-primary">
              {active.title}
            </h3>
            <p className="mt-1 text-muted-foreground">{active.description}</p>
          </div>

          <div className="relative mx-auto mt-6 max-w-5xl overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xl shadow-primary/5">
            <div
              aria-hidden="true"
              className="flex items-center gap-1.5 border-b border-border/70 bg-muted/40 px-4 py-2.5"
            >
              <span className="size-2.5 rounded-full bg-destructive/40" />
              <span className="size-2.5 rounded-full bg-warning/40" />
              <span className="size-2.5 rounded-full bg-success/40" />
            </div>
            <img
              src={active.image}
              alt={active.alt}
              className="w-full"
              loading="lazy"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
