import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InviteResendButton } from './invite-resend-button';

describe('InviteResendButton', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('calls onResend and shows a countdown after a successful resend', async () => {
    const onResend = vi.fn().mockResolvedValue(undefined);
    render(
      <InviteResendButton cooldownKey="test:invite-1" onResend={onResend} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại' }));

    await waitFor(() => expect(onResend).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole('button', { name: 'Gửi lại (30s)' }),
    ).toBeDisabled();
  });

  it('calls onError and does not start a cooldown when the resend fails', async () => {
    const onResend = vi.fn().mockRejectedValue(new Error('boom'));
    const onError = vi.fn();
    render(
      <InviteResendButton
        cooldownKey="test:invite-2"
        onResend={onResend}
        onError={onError}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại' }));

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Gửi lại' })).not.toBeDisabled();
  });

  it('keeps its outline button padding when no className override is given', () => {
    render(
      <InviteResendButton cooldownKey="test:invite-3" onResend={vi.fn()} />,
    );

    const button = screen.getByRole('button', { name: 'Gửi lại' });
    expect(button.className).toContain('px-3');
    expect(button.className).not.toContain('p-0');
  });
});
