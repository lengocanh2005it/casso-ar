import { useState } from 'react';
import { useResendCooldown } from '@/lib/use-resend-cooldown';
import { ResendCodeButton } from './resend-code-button';

interface InviteResendButtonProps {
  cooldownKey: string;
  onResend: () => Promise<unknown>;
  onError?: () => void;
  className?: string;
}

export function InviteResendButton({
  cooldownKey,
  onResend,
  onError,
  className,
}: InviteResendButtonProps) {
  const [pending, setPending] = useState(false);
  const { remainingSeconds, triggerResend } = useResendCooldown(cooldownKey);

  async function handleClick() {
    setPending(true);
    try {
      await triggerResend(onResend);
    } catch {
      onError?.();
    } finally {
      setPending(false);
    }
  }

  return (
    <ResendCodeButton
      label="Gửi lại"
      pending={pending}
      remainingSeconds={remainingSeconds}
      onClick={handleClick}
      variant="outline"
      size="sm"
      className={className}
    />
  );
}
