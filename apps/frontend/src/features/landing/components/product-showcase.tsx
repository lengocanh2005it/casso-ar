import { motion, useReducedMotion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LANDING_SHOWCASE_SCREENS } from '../landing-data';

type ShowcaseScreen = (typeof LANDING_SHOWCASE_SCREENS)[number];

function ShowcasePanel({
  screen,
  reducedMotion,
}: {
  screen: ShowcaseScreen;
  reducedMotion: boolean | null;
}) {
  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div className="mx-auto max-w-2xl text-center">
        <h3 className="text-xl font-semibold text-primary">{screen.title}</h3>
        <p className="mt-1 text-muted-foreground">{screen.description}</p>
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
          src={screen.image}
          alt={screen.alt}
          className="w-full"
          loading="lazy"
        />
      </div>
    </motion.div>
  );
}

export function ProductShowcase() {
  const reducedMotion = useReducedMotion();

  return (
    <section className="border-b border-border/60 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Xem Casso AR hoạt động
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Không phải mockup — đây là giao diện thật doanh nghiệp bạn sẽ dùng
            mỗi ngày.
          </p>
        </div>

        <Tabs defaultValue={LANDING_SHOWCASE_SCREENS[0].id} className="mt-8">
          <TabsList
            aria-label="Chọn màn hình Casso AR để xem"
            className="mx-auto flex h-auto w-fit max-w-full flex-wrap items-center justify-center gap-1.5 overflow-visible rounded-full border border-border/70 bg-muted/40 p-1.5 group-data-[orientation=horizontal]/tabs:h-auto"
          >
            {LANDING_SHOWCASE_SCREENS.map((screen) => {
              const Icon = screen.icon;
              return (
                <TabsTrigger
                  key={screen.id}
                  value={screen.id}
                  className="h-auto min-h-11 flex-auto rounded-full px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {screen.tabLabel}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {LANDING_SHOWCASE_SCREENS.map((screen) => (
            <TabsContent
              key={screen.id}
              value={screen.id}
              className="mt-8 outline-none"
            >
              <ShowcasePanel screen={screen} reducedMotion={reducedMotion} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
