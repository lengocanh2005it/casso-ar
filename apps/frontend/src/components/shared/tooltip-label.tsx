import * as React from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type TooltipLabelProps = {
  children: React.ReactElement;
  /** The full value. Omit when the label is already fully visible on screen. */
  label?: string | null;
  side?: 'top' | 'right' | 'bottom' | 'left';
};

/**
 * Radix opens a tooltip on keyboard focus, not just on hover.
 *
 * That is wrong here for two reasons:
 *
 * 1. Every `TooltipLabel` sits on a control whose value is already exposed —
 *    visible text, `aria-label`, or `aria-describedby`. Keyboard focus would
 *    therefore reveal a string the user can already perceive.
 * 2. An open tooltip registers as the highest dismissable layer, so it
 *    swallows the first Escape. Inside a dialog that autofocuses its first
 *    control — the Copilot history drawer, for one — Escape closed the
 *    tooltip and left the drawer open, needing a second press.
 *
 * Radix composes the consumer's `onFocus` before its own and skips opening
 * when the event is default-prevented, so cancelling it is the supported way
 * to opt out. A focus event has no default action to cancel, so this only
 * suppresses the tooltip.
 */
function suppressFocusOpen(event: React.FocusEvent) {
  event.preventDefault();
}

/**
 * One hover affordance for a clipped label.
 *
 * `title` used to be the mechanism, but the native bubble is drawn by the
 * browser in its own style: it ignored the light/dark tokens, and beside a
 * Radix tooltip the same string appeared twice. Everything here routes
 * through the app's Tooltip instead.
 *
 * The provider is mounted here rather than relied on from `main.tsx` so the
 * component keeps working in isolation — a spec, a story, or any future
 * render that is not under the root tree. Radix throws without it.
 */
export function TooltipLabel({
  children,
  label,
  side = 'top',
}: TooltipLabelProps) {
  if (!label) {
    return children;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild onFocus={suppressFocusOpen}>
          {children}
        </TooltipTrigger>
        <TooltipContent side={side}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
