import type * as React from 'react';
import { cn } from '@/lib/utils';

interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function Sheet({ open, children }: SheetProps) {
  return <div data-state={open ? 'open' : 'closed'}>{children}</div>;
}

interface SheetTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

function SheetTrigger({ children, ...props }: SheetTriggerProps) {
  return <button {...props}>{children}</button>;
}

function SheetClose(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} />;
}

interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: 'top' | 'right' | 'bottom' | 'left';
}

function SheetContent({
  className,
  children,
  side = 'left',
  ...props
}: SheetContentProps) {
  return (
    <div
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex flex-col gap-4 bg-sidebar text-sidebar-foreground shadow-lg transition-transform',
        side === 'left' && 'w-3/4 max-w-xs border-r',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function SheetOverlay({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('fixed inset-0 z-50 bg-black/50', className)}
      {...props}
    />
  );
}

export { Sheet, SheetClose, SheetContent, SheetOverlay, SheetTrigger };
