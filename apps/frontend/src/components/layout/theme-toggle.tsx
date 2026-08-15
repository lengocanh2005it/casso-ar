import { Moon, Sun } from 'lucide-react';
import { type ThemeMode, useTheme } from '@/contexts/theme-context';
import { cn } from '@/lib/utils';

const CYCLE: ThemeMode[] = ['system', 'light', 'dark'];

const LABELS: Record<ThemeMode, string> = {
  system: 'theo hệ thống',
  light: 'sáng',
  dark: 'tối',
};

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const next = CYCLE[(CYCLE.indexOf(theme) + 1) % CYCLE.length];

  return (
    <button
      type="button"
      aria-label={`Giao diện: ${LABELS[theme]} — chuyển sang ${LABELS[next]}`}
      title={`Giao diện: ${LABELS[theme]} — chuyển sang ${LABELS[next]}`}
      onClick={() => setTheme(next)}
      className={cn(
        'inline-flex items-center justify-center rounded-md p-1.5 transition-transform duration-150 hover:bg-sidebar-accent active:scale-95 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        className,
      )}
    >
      {resolvedTheme === 'dark' ? (
        <Moon className="size-4" />
      ) : (
        <Sun className="size-4" />
      )}
    </button>
  );
}
