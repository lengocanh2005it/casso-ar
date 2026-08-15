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
  TAP_SCALE,
  VIEWPORT_ONCE,
} from '../motion-variants';

export function FeaturesSection() {
  const reducedMotion = useReducedMotion();

  return (
    <section id="tinh-nang" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Mọi thứ bạn cần để quản lý công nợ
          </h2>
        </div>

        <motion.div
          className="mt-12 grid gap-4 md:grid-cols-3"
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
                whileTap={reducedMotion ? undefined : TAP_SCALE}
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
