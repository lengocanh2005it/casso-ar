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

// jsdom has no layout engine, so Element.scrollTo is missing and matchMedia
// always reports "no preference". Stub both here so production code can call
// them unconditionally instead of guarding every use site.
Element.prototype.scrollTo = () => {};

window.matchMedia = (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});

// The default 1000ms is too tight when vitest runs the full suite in parallel:
// a starved worker can take seconds to paint a lazy route/chart, so `findBy*`
// and `waitFor` time out even though the assertion is correct. This is why
// several specs previously hand-pinned `waitFor(..., { timeout: 15_000 })`.
// Give the async helpers one shared, generous budget instead.
configure({ asyncUtilTimeout: 10_000 });
