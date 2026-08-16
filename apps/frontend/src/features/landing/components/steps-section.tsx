import { motion, useReducedMotion } from 'framer-motion';
import { LANDING_STEPS } from '../landing-data';
import {
  FADE_UP_ITEM_VARIANTS,
  STAGGER_CONTAINER_VARIANTS,
  VIEWPORT_ONCE,
} from '../motion-variants';

export function StepsSection() {
  const reducedMotion = useReducedMotion();

  return (
    <section
      id="cach-hoat-dong"
      className="scroll-mt-24 border-y border-border/60 bg-muted/20 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ba bước là xong
          </h2>
        </div>

        <motion.div
          className="relative mt-14 grid gap-8 md:grid-cols-3"
          initial={reducedMotion ? false : 'hidden'}
          whileInView={reducedMotion ? undefined : 'visible'}
          viewport={VIEWPORT_ONCE}
          variants={STAGGER_CONTAINER_VARIANTS}
        >
          <div className="pointer-events-none absolute top-7 right-[16%] left-[16%] hidden h-px bg-border md:block" />
          {LANDING_STEPS.map((step) => (
            <motion.div
              key={step.step}
              className="relative text-center md:text-left"
              variants={FADE_UP_ITEM_VARIANTS}
            >
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border-2 border-primary/30 bg-background text-lg font-bold text-primary md:mx-0">
                {step.step}
              </div>
              <h3 className="text-xl font-semibold">{step.title}</h3>
              <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
