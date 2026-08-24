import { Button } from '@/components/ui/button';

interface ResendCodeButtonProps {
  label: string;
  pending: boolean;
  remainingSeconds: number;
  onClick: () => void;
}

export function ResendCodeButton({
  label,
  pending,
  remainingSeconds,
  onClick,
}: ResendCodeButtonProps) {
  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="link"
        className="h-auto p-0 text-sm"
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
