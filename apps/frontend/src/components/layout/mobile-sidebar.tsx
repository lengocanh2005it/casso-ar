import { Menu } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Sidebar } from './sidebar';

export function MobileSidebarWrapper({
  children = <Sidebar />,
}: {
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="rounded-md p-2 transition-[background-color,transform] duration-150 ease-out motion-reduce:transition-none motion-reduce:active:scale-100 pointer-hover:hover:bg-accent active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:hidden"
          aria-label="Mở menu điều hướng"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0">
        {children}
      </SheetContent>
    </Sheet>
  );
}
