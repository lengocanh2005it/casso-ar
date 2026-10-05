import { Moon, Sun } from 'lucide-react';
import { TooltipLabel } from '@/components/shared/tooltip-label';
import { type ThemeMode, useTheme } from '@/contexts/theme-context';
import { cn } from '@/lib/utils';

const LABELS: Record<ThemeMode, string> = {
  system: 'theo hệ thống',
  light: 'sáng',
  dark: 'tối',
};

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const next: ThemeMode = resolvedTheme === 'dark' ? 'light' : 'dark';

  return (
    <TooltipLabel
      label={`Giao diện: ${LABELS[theme]} — chuyển sang ${LABELS[next]}`}
    >
      <button
        type="button"
        aria-label={`Giao diện: ${LABELS[theme]} — chuyển sang ${LABELS[next]}`}
        onClick={() => setTheme(next)}
        className={cn(
          'inline-flex items-center justify-center rounded-md p-1.5 transition-[background-color] duration-150 ease-out motion-reduce:transition-none pointer-hover:hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
          className,
        )}
      >
        {resolvedTheme === 'dark' ? (
          <Moon aria-hidden="true" className="size-4" />
        ) : (
          <Sun aria-hidden="true" className="size-4" />
        )}
      </button>
    </TooltipLabel>
  );
}
