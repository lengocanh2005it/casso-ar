import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type HeaderIconTone =
  | 'brand'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'ai';

const toneClasses: Record<HeaderIconTone, string> = {
  brand: 'bg-primary/10 text-primary',
  info: 'bg-info/10 text-info',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/15 text-warning-foreground',
  danger: 'bg-destructive/10 text-destructive',
  ai: 'bg-primary/10 text-primary',
};

export function HeaderIcon({
  icon: Icon,
  tone = 'brand',
}: {
  icon: LucideIcon;
  tone?: HeaderIconTone;
}) {
  return (
    <div
      data-testid="header-icon"
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-lg',
        toneClasses[tone],
      )}
    >
      <Icon aria-hidden="true" className="size-5" />
    </div>
  );
}
