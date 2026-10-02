import { LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LANDING_SHOWCASE_SCREENS } from '../landing-data';

const AUTO_ADVANCE_INTERVAL_MS = 2500;

type ShowcaseScreen = (typeof LANDING_SHOWCASE_SCREENS)[number];
type ShowcaseScreenId = ShowcaseScreen['id'];

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
  const [activeScreen, setActiveScreen] = useState<ShowcaseScreenId>(
    LANDING_SHOWCASE_SCREENS[0].id,
  );
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (reducedMotion || isHovered || isFocused) return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;

      setActiveScreen((currentScreen) => {
        const currentIndex = LANDING_SHOWCASE_SCREENS.findIndex(
          (screen) => screen.id === currentScreen,
        );
        const nextIndex = (currentIndex + 1) % LANDING_SHOWCASE_SCREENS.length;
        return LANDING_SHOWCASE_SCREENS[nextIndex].id;
      });
    }, AUTO_ADVANCE_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [isFocused, isHovered, reducedMotion]);

  return (
    <section
      id="san-pham"
      className="scroll-mt-24 border-b border-border/60 py-16 sm:py-20"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Xem <span className="text-primary">Casso AR</span> hoạt động
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Không phải mockup — đây là giao diện thật doanh nghiệp bạn sẽ dùng
            mỗi ngày.
          </p>
        </div>

        <LayoutGroup id="landing-showcase-tabs">
          <Tabs
            value={activeScreen}
            onValueChange={(value) => {
              const nextScreen = LANDING_SHOWCASE_SCREENS.find(
                (screen) => screen.id === value,
              );
              if (nextScreen) setActiveScreen(nextScreen.id);
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onFocusCapture={() => setIsFocused(true)}
            onBlurCapture={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              ) {
                setIsFocused(false);
              }
            }}
            className="mt-8"
          >
            <TabsList
              aria-label="Chọn màn hình Casso AR để xem"
              className="mx-auto flex h-auto w-fit max-w-full flex-nowrap items-center justify-center gap-1 overflow-visible rounded-full border border-border/70 bg-muted/40 p-1 sm:gap-1.5 sm:p-1.5 group-data-[orientation=horizontal]/tabs:h-auto"
            >
              {LANDING_SHOWCASE_SCREENS.map((screen) => {
                const Icon = screen.icon;
                return (
                  <TabsTrigger
                    key={screen.id}
                    value={screen.id}
                    className="group isolate h-auto min-h-11 flex-auto whitespace-nowrap rounded-full px-1 py-2 text-xs font-medium data-[state=active]:bg-transparent data-[state=active]:text-primary-foreground data-[state=active]:shadow-none sm:px-4 sm:text-sm"
                  >
                    {activeScreen === screen.id && (
                      <motion.span
                        layoutId="showcase-tab-indicator"
                        data-testid="showcase-tab-indicator"
                        aria-hidden="true"
                        className="absolute inset-0 z-0 rounded-full bg-primary shadow-sm"
                        transition={
                          reducedMotion
                            ? { duration: 0 }
                            : { type: 'spring', stiffness: 460, damping: 38 }
                        }
                      />
                    )}
                    <span className="relative z-10 inline-flex items-center gap-1 whitespace-nowrap group-data-[state=active]:text-primary-foreground sm:gap-2">
                      <Icon className="size-4" aria-hidden="true" />
                      {screen.tabLabel}
                    </span>
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
        </LayoutGroup>
      </div>
    </section>
  );
}
