import * as React from 'react';
import { cn } from '@/lib/utils';

interface SheetContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SheetContext = React.createContext<SheetContextValue | null>(null);

interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function Sheet({ open: controlledOpen, onOpenChange, children }: SheetProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const change = onOpenChange ?? setUncontrolledOpen;
  return (
    <SheetContext.Provider value={{ open, onOpenChange: change }}>
      <div data-state={open ? 'open' : 'closed'}>{children}</div>
    </SheetContext.Provider>
  );
}

interface SheetTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

function SheetTrigger({ children, asChild, ...props }: SheetTriggerProps) {
  const context = React.useContext(SheetContext);
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      ...props,
      onClick: (event: React.MouseEvent) => {
        props.onClick?.(event as React.MouseEvent<HTMLButtonElement>);
        context?.onOpenChange(true);
      },
    } as React.HTMLAttributes<HTMLElement>);
  }
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      onClick={(event) => {
        props.onClick?.(event);
        context?.onOpenChange(true);
      }}
    >
      {children}
    </button>
  );
}

function SheetClose(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const context = React.useContext(SheetContext);
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      onClick={(event) => {
        props.onClick?.(event);
        context?.onOpenChange(false);
      }}
    />
  );
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
  const context = React.useContext(SheetContext);
  if (!context?.open) return null;
  return (
    <>
      <SheetOverlay onClick={() => context.onOpenChange(false)} />
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
    </>
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
