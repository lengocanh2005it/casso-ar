import type { ComponentProps, MouseEvent } from 'react';
import { cn } from '@/lib/utils';

interface BreakerSwitchProps
  extends Omit<
    ComponentProps<'button'>,
    | 'aria-checked'
    | 'aria-label'
    | 'children'
    | 'disabled'
    | 'onClick'
    | 'role'
    | 'type'
  > {
  checked: boolean;
  onCheckedChange: () => void;
  label: string;
  disabled?: boolean;
  onClick?: ComponentProps<'button'>['onClick'];
}

export function BreakerSwitch({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  onClick,
  ...buttonProps
}: BreakerSwitchProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onCheckedChange();
    onClick?.(event);
  }

  return (
    <button
      {...buttonProps}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={disabled}
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        'relative h-8 w-14 touch-manipulation rounded-full border-2 transition-colors duration-200 motion-reduce:transition-none pointer-hover:hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60',
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
