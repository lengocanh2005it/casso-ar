import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type HeaderIconTone =
  | 'brand'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'ai';

// `ai` previously aliased `brand`, which made every analytics surface look
// identical to the landing page. Analytics and AI get their own blue so the
// pages stay distinguishable at a glance.
const toneClasses: Record<HeaderIconTone, string> = {
  brand: 'bg-primary/10 text-primary',
  info: 'bg-info/10 text-info',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/15 text-warning-strong',
  danger: 'bg-destructive/10 text-destructive',
  ai: 'bg-info/15 text-info',
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
