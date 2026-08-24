import { Button, type ButtonProps } from '@/components/ui/button';

interface ResendCodeButtonProps {
  label: string;
  pending: boolean;
  remainingSeconds: number;
  onClick: () => void;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
}

export function ResendCodeButton({
  label,
  pending,
  remainingSeconds,
  onClick,
  variant = 'link',
  size,
  className = 'h-auto p-0 text-sm',
}: ResendCodeButtonProps) {
  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={onClick}
        disabled={pending || remainingSeconds > 0}
      >
        {pending
          ? 'Đang gửi…'
          : remainingSeconds > 0
            ? `${label} (${remainingSeconds}s)`
            : label}
      </Button>
      {remainingSeconds > 0 && (
        <p
          className="text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          Bạn có thể gửi lại sau {remainingSeconds} giây.
        </p>
      )}
    </div>
  );
}
