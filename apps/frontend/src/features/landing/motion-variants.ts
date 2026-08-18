// Static framer-motion prop objects, hoisted so scroll-reveal sections don't
// recreate them on every render (rerender-memo-with-default-value).
export const STAGGER_CONTAINER_VARIANTS = {
  visible: { transition: { staggerChildren: 0.05 } },
};

// x/y/scale shorthand (not a raw `transform` string) so Motion composes the
// entrance translate with the hover scale on the same element instead of one
// overwriting the other — a raw-string collision there animates directly
// between mismatched transform shapes (e.g. scale(1.02) -> translateY(0px)),
// which reads as a snap/warp glitch when hover fires rapidly.
export const FADE_UP_ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

export const VIEWPORT_ONCE = { once: true };

// Explicit short tween — without it Motion falls back to a stiff default
// spring that overshoots, reading as a snap-shrink-then-grow glitch.
export const HOVER_SCALE = {
  scale: 1.02,
  transition: { duration: 0.15, ease: 'easeOut' as const },
};

// Stronger ease-out than the CSS/Motion default — used for UI entrances.
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
