import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { HeaderIcon } from './header-icon';

interface SectionHeadingProps {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}

export function SectionHeading({
  icon,
  title,
  description,
  action,
}: SectionHeadingProps) {
  return (
    <div
      data-slot="section-heading"
      className="flex flex-col items-start justify-between gap-3 rounded-lg border border-border bg-card p-4 min-[521px]:flex-row min-[521px]:items-center"
    >
      <div className="flex min-w-0 items-center gap-3">
        <HeaderIcon icon={icon} tone="info" />
        <div className="min-w-0">
          <h2 className="text-lg font-medium">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {action && (
        <div className="w-full min-[521px]:w-auto min-[521px]:shrink-0">
          {action}
        </div>
      )}
    </div>
  );
}
