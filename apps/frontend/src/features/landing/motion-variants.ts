// Static framer-motion prop objects, hoisted so scroll-reveal sections don't
// recreate them on every render (rerender-memo-with-default-value).
export const STAGGER_CONTAINER_VARIANTS = {
  visible: { transition: { staggerChildren: 0.05 } },
};

export const FADE_UP_ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

export const VIEWPORT_ONCE = { once: true };

export const HOVER_SCALE = { scale: 1.02 };
export const TAP_SCALE = { scale: 0.98 };
