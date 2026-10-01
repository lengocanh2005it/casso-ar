import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ICON_COLORS = {
  default: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
} as const;

const BORDER_COLORS = {
  default: 'border-l-primary',
  success: 'border-l-success',
  warning: 'border-l-warning',
  danger: 'border-l-destructive',
} as const;

const LABEL_COLORS = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning-strong',
  danger: 'text-destructive',
} as const;

export type MetricCardVariant = keyof typeof ICON_COLORS;

export function MetricCard({
  label,
  description,
  value,
  icon: Icon,
  variant = 'default',
  className,
  empty = false,
}: {
  label: string;
  description: string;
  value: string;
  icon: LucideIcon;
  variant?: MetricCardVariant;
  className?: string;
  empty?: boolean;
}) {
  return (
    <Card
      className={`@container border-l-4 ${BORDER_COLORS[variant]} transition-shadow hover:shadow-md ${className ?? ''}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Icon className={`size-4 ${ICON_COLORS[variant]}`} />
          <CardTitle className={`text-sm font-medium ${LABEL_COLORS[variant]}`}>
            {label}
          </CardTitle>
        </div>
        <p className="text-xs text-muted-foreground max-sm:hidden">
          {description}
        </p>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="text-sm text-muted-foreground">Chưa có dữ liệu</p>
        ) : (
          // A VND figure runs long, and these grids put 2 cards per row from
          // 640px and 4 from 1280px — either can leave the amount track
          // narrower than 24px type, which clipped the digits. Step the type
          // down to fit instead of hiding the number.
          // A VND figure runs long, and these grids put 2 cards per row from
          // 640px and 4 from 1280px — either can leave the amount track
          // narrower than 24px type, which clipped the digits. Step the type
          // down to fit instead of hiding the number.
          <p className="text-xl font-semibold tabular-nums text-foreground @xs:text-2xl">
            {value}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
