import { Monitor, Moon, Sun } from 'lucide-react';
import { type ThemeMode, useTheme } from '@/contexts/theme-context';
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

export function AppearanceTab() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">Giao diện</h3>
        <p className="text-sm text-muted-foreground">
          Chọn chế độ hiển thị cho ứng dụng.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {THEMES.map(({ value, label, description, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-[border-color,background-color] duration-150 ease-out motion-reduce:transition-none',
              theme === value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-accent/50',
            )}
          >
            <Icon
              className={cn(
                'size-6',
                theme === value ? 'text-primary' : 'text-muted-foreground',
              )}
            />
            <div className="text-center">
              <p
                className={cn(
                  'text-sm font-medium',
                  theme === value ? 'text-primary' : 'text-foreground',
                )}
              >
                {label}
              </p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
