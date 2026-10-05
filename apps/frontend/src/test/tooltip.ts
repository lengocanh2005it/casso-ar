import { fireEvent, waitFor } from '@testing-library/react';

/**
 * Open a Radix tooltip on `trigger` and wait for its content.
 *
 * Radix listens for a pointer *move*, not just an enter, so a bare
 * `pointerEnter` leaves the tooltip closed in jsdom and the assertion below
 * would pass for the wrong reason (nothing was ever rendered).
 *
 * Returns the visible tooltip text. Radix mirrors the content into a 1×1
 * screen-reader-only span, so the element's own `textContent` reads doubled
 * — collect only the direct text nodes, which are what a user actually sees.
 */
export async function hoverTooltip(trigger: Element | null): Promise<string> {
  if (!trigger) {
    throw new Error('no tooltip trigger found');
  }

  fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
  fireEvent.pointerMove(trigger, { pointerType: 'mouse' });
  fireEvent.mouseEnter(trigger);

  let text = '';
  await waitFor(() => {
    const content = trigger.ownerDocument.querySelector<HTMLElement>(
      '[data-slot="tooltip-content"]',
    );
    if (!content) {
      throw new Error('tooltip did not open');
    }
    text = Array.from(content.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? '')
      .join('');
  });

  return text;
}
