import { configure } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// jsdom has no IntersectionObserver — framer-motion's whileInView (used by
// scroll-reveal animations) needs one to mount without throwing.
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

globalThis.IntersectionObserver =
  globalThis.IntersectionObserver ??
  (MockIntersectionObserver as unknown as typeof IntersectionObserver);

// jsdom has no ResizeObserver either — Radix Popper (Tooltip, Popover,
// Select, DropdownMenu) mounts it to position its floating content.
class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver =
  globalThis.ResizeObserver ??
  (MockResizeObserver as unknown as typeof ResizeObserver);

// The default 1000ms is too tight when vitest runs the full suite in parallel:
// a starved worker can take seconds to paint a lazy route/chart, so `findBy*`
// and `waitFor` time out even though the assertion is correct. This is why
// several specs previously hand-pinned `waitFor(..., { timeout: 15_000 })`.
// Give the async helpers one shared, generous budget instead.
configure({ asyncUtilTimeout: 10_000 });
