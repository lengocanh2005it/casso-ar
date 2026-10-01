import * as React from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type TruncatedTextProps = {
  children: React.ReactNode;
  className?: string;
  /** The full value. When omitted the text is already in the DOM, so a tooltip would only repeat it. */
  value?: string | null;
};

/**
 * Text clipped by CSS that reveals the untruncated value on hover.
 *
 * Only use when the element is actually clipped — `value` is what a visitor
 * would otherwise have to guess, and a tooltip over already-visible text is
 * noise. Keeps the native `title` too: it is the fallback for touch and for
 * anyone whose browser never fires pointer events on the span.
 */
export function TruncatedText({
  children,
  className,
  value,
}: TruncatedTextProps) {
  const content =
    value ?? (typeof children === 'string' ? children : undefined);

  if (!content) {
    return <span className={className}>{children}</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={className} title={content}>
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent>{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Convenience wrapper for the common truncate + customer-name shape. */
export function TruncatedName({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <TruncatedText className={cn('min-w-0 truncate', className)} value={name}>
      {name}
    </TruncatedText>
  );
}
