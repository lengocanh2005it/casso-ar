import { motion, useReducedMotion } from 'framer-motion';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { LANDING_FEATURES } from '../landing-data';
import {
  FADE_UP_ITEM_VARIANTS,
  HOVER_SCALE,
  STAGGER_CONTAINER_VARIANTS,
  VIEWPORT_ONCE,
} from '../motion-variants';

export function FeaturesSection() {
  const reducedMotion = useReducedMotion();

  return (
    <section
      id="tinh-nang"
      className="scroll-mt-24 border-b border-border/60 bg-muted/20 py-16 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Mọi thứ bạn cần để quản lý công nợ
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Từ theo dõi đến nhắc nợ, mọi công cụ cần thiết đều ở một nơi.
          </p>
        </div>

        <motion.div
          className="mt-10 grid gap-4 md:grid-cols-3"
          initial={reducedMotion ? false : 'hidden'}
          whileInView={reducedMotion ? undefined : 'visible'}
          viewport={VIEWPORT_ONCE}
          variants={STAGGER_CONTAINER_VARIANTS}
        >
          {LANDING_FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                variants={FADE_UP_ITEM_VARIANTS}
                whileHover={reducedMotion ? undefined : HOVER_SCALE}
              >
                <Card className="h-full border-border/70">
                  <CardHeader>
                    <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon
                        className="size-5 text-primary"
                        aria-hidden="true"
                      />
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                    <CardDescription className="text-base">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
