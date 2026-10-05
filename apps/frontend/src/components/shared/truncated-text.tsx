import * as React from 'react';

import { TooltipLabel } from '@/components/shared/tooltip-label';
import { cn } from '@/lib/utils';

type TruncatedTextProps = {
  children: React.ReactNode;
  className?: string;
  /** The full value. When omitted the text is already in the DOM, so a tooltip would only repeat it. */
  value?: string | null;
  /** Machine names must not be auto-translated by the browser. */
  translate?: 'yes' | 'no';
};

/**
 * Text clipped by CSS that reveals the untruncated value on hover.
 *
 * Only use when the element is actually clipped — `value` is what a visitor
 * would otherwise have to guess, and a tooltip over already-visible text is
 * noise.
 *
 * Exactly one tooltip: Radix renders into a portal, and adding the native
 * `title` attribute on top of it raised a second, near-identical bubble a
 * fraction of a second later, so hovering showed the same string twice.
 */
export function TruncatedText({
  children,
  className,
  value,
  translate,
}: TruncatedTextProps) {
  const content =
    value ?? (typeof children === 'string' ? children : undefined);

  if (!content) {
    return (
      <span className={className} translate={translate}>
        {children}
      </span>
    );
  }

  return (
    <TooltipLabel label={content}>
      <span className={className} translate={translate}>
        {children}
      </span>
    </TooltipLabel>
  );
}

/**
 * Convenience wrapper for the common truncate + customer-name shape.
 *
 * `block` is load-bearing, not decoration: `truncate` relies on
 * `overflow:hidden`, which an inline span ignores — the text then escapes its
 * cell and paints over the next column.
 */
export function TruncatedName({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <TruncatedText
      className={cn('block min-w-0 truncate', className)}
      value={name}
    >
      {name}
    </TruncatedText>
  );
}
