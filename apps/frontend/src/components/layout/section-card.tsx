import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SectionCardProps {
  icon?: LucideIcon;
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Card + fade-up entrance used across the post-login list pages
 * (Customers, Receivables, Reminders, Exceptions, Settings tabs). Pass
 * `className="[animation-delay:Nms]"` for staggered entrances when a page
 * renders more than one SectionCard.
 */
export function SectionCard({
  icon: Icon,
  title,
  description,
  action,
  className,
  children,
}: SectionCardProps) {
  const hasHeader = Icon || title || description || action;

  return (
    <Card
      className={cn('animate-fade-up motion-reduce:animate-none', className)}
    >
      {hasHeader && (
        <CardHeader>
          {(Icon || title) && (
            <div className="flex items-center gap-2">
              {Icon && (
                <Icon aria-hidden="true" className="size-4 text-primary" />
              )}
              {title && <CardTitle>{title}</CardTitle>}
            </div>
          )}
          {description && <CardDescription>{description}</CardDescription>}
          {action && <CardAction>{action}</CardAction>}
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
    </Card>
  );
}
