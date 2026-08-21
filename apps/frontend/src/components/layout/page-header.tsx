import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { HeaderIcon } from './header-icon';
import { ThemeToggle } from './theme-toggle';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
  hideThemeToggle?: boolean;
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
  hideThemeToggle = false,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-10 border-b border-border bg-background px-4 py-4 text-foreground sm:px-6 lg:top-0',
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && <HeaderIcon icon={Icon} />}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-foreground sm:text-xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 self-stretch sm:w-auto sm:shrink-0 sm:self-auto sm:justify-end">
          {actions}
          {!hideThemeToggle ? (
            <ThemeToggle className="hidden lg:inline-flex" />
          ) : null}
        </div>
      </div>
    </header>
  );
}
