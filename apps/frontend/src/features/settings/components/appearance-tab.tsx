import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { HeaderIcon } from '@/components/layout/header-icon';
import {
  type ResolvedTheme,
  type ThemeMode,
  useTheme,
} from '@/contexts/theme-context';
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

const PREVIEW_IMAGES: Record<
  ResolvedTheme,
  { desktop: string; mobile: string; alt: string }
> = {
  light: {
    desktop: '/showcase-dashboard.png',
    mobile: '/appearance-preview-mobile-light.jpg',
    alt: 'Giao diện thật Casso AR chế độ sáng',
  },
  dark: {
    desktop: '/appearance-preview-desktop-dark.jpg',
    mobile: '/appearance-preview-mobile-dark.jpg',
    alt: 'Giao diện thật Casso AR chế độ tối',
  },
};

function AppearancePreview({
  resolvedTheme,
}: {
  resolvedTheme: ResolvedTheme;
}) {
  const images = PREVIEW_IMAGES[resolvedTheme];

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

      <picture>
        <source
          data-testid="mobile-preview-source"
          media="(max-width: 767px)"
          srcSet={images.mobile}
        />
        <img
          className="block h-auto w-full"
          src={images.desktop}
          alt={images.alt}
        />
      </picture>
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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-1">
          {THEMES.map(({ value, label, description, icon: Icon }) => {
            const selected = theme === value;

            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => setTheme(value)}
                className={cn(
                  'flex min-h-16 items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors motion-reduce:transition-none',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  selected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-accent/50',
                )}
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-md',
                    selected
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {description}
                  </span>
                </span>
                {selected && (
                  <span className="flex shrink-0 items-center text-primary">
                    <span className="sr-only">Đang dùng</span>
                    <Check className="size-3.5" aria-hidden="true" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <AppearancePreview resolvedTheme={resolvedTheme} />
      </div>
    </div>
  );
}
