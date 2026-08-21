import type { LucideIcon } from 'lucide-react';

export function HeaderIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <Icon aria-hidden="true" className="size-5" />
    </div>
  );
}
