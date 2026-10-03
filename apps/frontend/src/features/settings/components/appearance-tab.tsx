import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { HeaderIcon } from '@/components/layout/header-icon';
import {
  type ResolvedTheme,
  type ThemeMode,
  useTheme,
} from '@/contexts/theme-context';
import { DashboardPreview } from '@/features/dashboard/components/dashboard-preview';
import { cn } from '@/lib/utils';

const THEMES: {
  value: ThemeMode;
  label: string;
  description: string;
  icon: typeof Sun;
}[] = [
  {
    value: 'light',
    label: 'Sáng',
    description: 'Giao diện sáng',
    icon: Sun,
  },
  {
    value: 'dark',
    label: 'Tối',
    description: 'Giao diện tối',
    icon: Moon,
  },
  {
    value: 'system',
    label: 'Hệ thống',
    description: 'Theo cài đặt thiết bị',
    icon: Monitor,
  },
];

function AppearancePreview({
  resolvedTheme,
}: {
  resolvedTheme: ResolvedTheme;
}) {
  return (
    <section
      aria-label={`Bản xem trước giao diện ${resolvedTheme === 'dark' ? 'tối' : 'sáng'}`}
      className="overflow-hidden rounded-lg border bg-card"
    >
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Monitor
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <h4 className="text-sm font-medium">Bản xem trước</h4>
        </div>
        <span className="text-xs text-muted-foreground">
          Đang hiển thị: {resolvedTheme === 'dark' ? 'Tối' : 'Sáng'}
        </span>
      </div>

      <DashboardPreview />
    </section>
  );
}

export function AppearanceTab() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <HeaderIcon icon={Palette} tone="info" />
        <div>
          <h3 className="text-lg font-medium">Giao diện</h3>
          <p className="text-sm text-muted-foreground">
            Chọn chế độ hiển thị cho ứng dụng.
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
        <fieldset className="grid content-start grid-cols-3 gap-1.5 sm:gap-2 xl:grid-cols-1">
          <legend className="sr-only">Chế độ giao diện</legend>
          {THEMES.map(({ value, label, description, icon: Icon }) => {
            const selected = theme === value;

            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => setTheme(value)}
                className={cn(
                  'relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-1.5 py-1.5 text-center transition-colors motion-reduce:transition-none',
                  'sm:flex-row sm:justify-start sm:gap-3 sm:px-3 sm:py-2.5 sm:text-left',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  selected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-accent/50',
                )}
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-md sm:size-9',
                    selected
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon className="size-4 sm:size-5" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-col items-center sm:flex-1 sm:items-start">
                  <span className="block text-xs font-medium sm:text-sm">
                    {label}
                  </span>
                  <span className="sr-only block text-xs text-muted-foreground sm:not-sr-only">
                    {description}
                  </span>
                </span>
                {selected && (
                  <span className="absolute right-1.5 top-1.5 flex shrink-0 items-center text-primary sm:static">
                    <span className="sr-only">Đang dùng</span>
                    <Check className="size-3.5" aria-hidden="true" />
                  </span>
                )}
              </button>
            );
          })}
        </fieldset>

        <AppearancePreview resolvedTheme={resolvedTheme} />
      </div>
    </div>
  );
}
