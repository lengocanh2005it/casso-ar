import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ICON_COLORS = {
  default: 'text-primary',
  success: 'text-emerald-500',
  warning: 'text-amber-500',
  danger: 'text-red-500',
} as const;

const BORDER_COLORS = {
  default: 'border-l-primary',
  success: 'border-l-emerald-500',
  warning: 'border-l-amber-500',
  danger: 'border-l-red-500',
} as const;

export type MetricCardVariant = keyof typeof ICON_COLORS;

export function MetricCard({
  label,
  description,
  value,
  icon: Icon,
  variant = 'default',
  className,
}: {
  label: string;
  description: string;
  value: string;
  icon: LucideIcon;
  variant?: MetricCardVariant;
  className?: string;
}) {
  return (
    <Card
      className={`border-l-4 ${BORDER_COLORS[variant]} transition-shadow hover:shadow-md ${className ?? ''}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Icon className={`size-4 ${ICON_COLORS[variant]}`} />
          <CardTitle className="text-sm font-medium text-primary">
            {label}
          </CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tabular-nums text-foreground">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
