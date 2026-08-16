// Static framer-motion prop objects, hoisted so scroll-reveal sections don't
// recreate them on every render (rerender-memo-with-default-value).
export const STAGGER_CONTAINER_VARIANTS = {
  visible: { transition: { staggerChildren: 0.05 } },
};

// transform as a raw string (not the x/y/scale shorthand) so this animates
// via the hardware-accelerated transform property instead of Motion's
// main-thread requestAnimationFrame interpolation for shorthand props.
export const FADE_UP_ITEM_VARIANTS = {
  hidden: { opacity: 0, transform: 'translateY(12px)' },
  visible: { opacity: 1, transform: 'translateY(0px)' },
};

export const VIEWPORT_ONCE = { once: true };

export const HOVER_SCALE = { transform: 'scale(1.02)' };

// Stronger ease-out than the CSS/Motion default — used for UI entrances.
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
