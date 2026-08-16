import { Dialog } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function Sheet({ open, onOpenChange, children }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </Dialog.Root>
  );
}

type SheetTriggerProps = React.ComponentPropsWithoutRef<typeof Dialog.Trigger>;

function SheetTrigger(props: SheetTriggerProps) {
  return <Dialog.Trigger {...props} />;
}

function SheetClose(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Dialog.Close asChild>
      <button {...props} type={props.type ?? 'button'} />
    </Dialog.Close>
  );
}

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof Dialog.Content> {
  side?: 'top' | 'right' | 'bottom' | 'left';
}

function SheetContent({
  className,
  children,
  side = 'left',
  ...props
}: SheetContentProps) {
  const sideClasses: Record<string, string> = {
    left: 'inset-y-0 left-0 w-3/4 max-w-xs border-r data-[state=closed]:slide-out-to-left-full data-[state=open]:slide-in-from-left-full',
    right:
      'inset-y-0 right-0 w-3/4 max-w-xs border-l data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-right-full',
    top: 'inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top-full data-[state=open]:slide-in-from-top-full',
    bottom:
      'inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom-full data-[state=open]:slide-in-from-bottom-full',
  };
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
      <Dialog.Content
        className={cn(
          'fixed z-50 flex flex-col gap-4 overscroll-contain bg-sidebar text-sidebar-foreground shadow-lg duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in motion-reduce:animate-none',
          sideClasses[side],
          className,
        )}
        {...props}
      >
        <Dialog.Title className="sr-only">Menu điều hướng</Dialog.Title>
        <Dialog.Description className="sr-only">
          Điều hướng ứng dụng
        </Dialog.Description>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}

function SheetOverlay(props: React.HTMLAttributes<HTMLDivElement>) {
  return <Dialog.Overlay {...props} />;
}

export { Sheet, SheetClose, SheetContent, SheetOverlay, SheetTrigger };
