import { cn } from '@/lib/utils';

interface BreakerSwitchProps {
  checked: boolean;
  onCheckedChange: () => void;
  label: string;
}

export function BreakerSwitch({
  checked,
  onCheckedChange,
  label,
}: BreakerSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onCheckedChange}
      className={cn(
        'relative h-8 w-14 rounded-full border-2 transition-colors duration-200 motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        checked
          ? 'border-destructive bg-destructive/20 shadow-[0_0_10px] shadow-destructive/60'
          : 'border-border bg-muted',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 size-6 rounded-full shadow transition-transform duration-200 motion-reduce:transition-none',
          checked
            ? 'translate-x-6 bg-destructive'
            : 'translate-x-0.5 bg-primary',
        )}
      />
    </button>
  );
}
