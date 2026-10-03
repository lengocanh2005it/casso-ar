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

const PREVIEW_COLORS: Record<
  ResolvedTheme,
  {
    canvas: string;
    surface: string;
    line: string;
    muted: string;
    text: string;
    subtleText: string;
    accent: string;
    accentText: string;
  }
> = {
  light: {
    canvas: 'bg-slate-50',
    surface: 'bg-white',
    line: 'border-slate-200',
    muted: 'bg-slate-100',
    text: 'text-slate-900',
    subtleText: 'text-slate-500',
    accent: 'bg-emerald-50',
    accentText: 'text-emerald-700',
  },
  dark: {
    canvas: 'bg-[#161d19]',
    surface: 'bg-[#202923]',
    line: 'border-[#36433a]',
    muted: 'bg-[#2b362f]',
    text: 'text-[#f1f5f2]',
    subtleText: 'text-[#a6b3a9]',
    accent: 'bg-[#244333]',
    accentText: 'text-[#8bd3a7]',
  },
};

function AppearancePreview({
  resolvedTheme,
}: {
  resolvedTheme: ResolvedTheme;
}) {
  const colors = PREVIEW_COLORS[resolvedTheme];

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

      <div
        className={cn(
          'grid min-h-56 grid-cols-[76px_minmax(0,1fr)] sm:grid-cols-[112px_minmax(0,1fr)]',
          colors.canvas,
          colors.text,
        )}
      >
        <aside
          className={cn('border-r p-2.5 sm:p-3', colors.line, colors.surface)}
        >
          <div className="mb-4 flex items-center gap-1.5">
            <span className="flex size-5 items-center justify-center rounded bg-emerald-600 text-[10px] font-bold text-white">
              C
            </span>
            <span className="hidden text-[10px] font-semibold sm:inline">
              Casso AR
            </span>
          </div>
          <div className="space-y-1.5 text-[9px] sm:text-[10px]">
            <div className={cn('rounded px-1.5 py-1.5', colors.subtleText)}>
              Tổng quan
            </div>
            <div
              className={cn(
                'rounded px-1.5 py-1.5 font-medium',
                colors.accent,
                colors.accentText,
              )}
            >
              Công nợ
            </div>
            <div className={cn('rounded px-1.5 py-1.5', colors.subtleText)}>
              Ngân hàng
            </div>
          </div>
        </aside>

        <div className="min-w-0 p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className={cn('text-[9px] sm:text-[10px]', colors.subtleText)}>
                QUẢN LÝ CÔNG NỢ
              </p>
              <p className="mt-0.5 text-xs font-semibold sm:text-sm">
                Bảng công nợ
              </p>
            </div>
            <span className="rounded border border-emerald-600 bg-emerald-600 px-2 py-1 text-[9px] font-medium text-white sm:text-[10px]">
              Thêm khoản phải thu
            </span>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            {['Khách hàng', 'Trạng thái'].map((label) => (
              <div
                key={label}
                className={cn(
                  'rounded border p-2',
                  colors.line,
                  colors.surface,
                )}
              >
                <p className={cn('text-[9px]', colors.subtleText)}>{label}</p>
                <div
                  className={cn('mt-2 h-2 w-2/3 rounded-sm', colors.muted)}
                />
              </div>
            ))}
          </div>

          <div
            className={cn(
              'overflow-hidden rounded border',
              colors.line,
              colors.surface,
            )}
          >
            <div
              className={cn(
                'grid grid-cols-[1.3fr_1fr_0.7fr] gap-2 border-b px-2 py-1.5 text-[8px] sm:text-[9px]',
                colors.line,
                colors.subtleText,
              )}
            >
              <span>Khách hàng</span>
              <span>Số tiền</span>
              <span>Trạng thái</span>
            </div>
            {[0, 1].map((row) => (
              <div
                key={row}
                className={cn(
                  'grid grid-cols-[1.3fr_1fr_0.7fr] items-center gap-2 px-2 py-2',
                  row === 0 ? `border-b ${colors.line}` : '',
                )}
              >
                <div className={cn('h-2 rounded-sm', colors.muted)} />
                <div className={cn('h-2 rounded-sm', colors.muted)} />
                <div className="h-3 rounded-full bg-emerald-500/15" />
              </div>
            ))}
          </div>
        </div>
      </div>
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
