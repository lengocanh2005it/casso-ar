import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResendCodeButton } from './resend-code-button';

describe('ResendCodeButton', () => {
  it('calls onClick when ready', () => {
    const onClick = vi.fn();
    render(
      <ResendCodeButton
        label="Gửi lại mã"
        pending={false}
        remainingSeconds={0}
        onClick={onClick}
      />,
    );

    const button = screen.getByRole('button', { name: 'Gửi lại mã' });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows the pending label and disables while sending', () => {
    render(
      <ResendCodeButton
        label="Gửi lại mã"
        pending
        remainingSeconds={0}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Đang gửi…' })).toBeDisabled();
  });

  it('shows the countdown in the label and disables during cooldown', () => {
    render(
      <ResendCodeButton
        label="Gửi lại mã"
        pending={false}
        remainingSeconds={17}
        onClick={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Gửi lại mã (17s)' }),
    ).toBeDisabled();
  });

  it('exposes the countdown to screen readers via an adjacent status message', () => {
    render(
      <ResendCodeButton
        label="Gửi lại mã"
        pending={false}
        remainingSeconds={17}
        onClick={vi.fn()}
      />,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('17 giây');
  });

  it('does not render a status message when there is no cooldown', () => {
    render(
      <ResendCodeButton
        label="Gửi lại mã"
        pending={false}
        remainingSeconds={0}
        onClick={vi.fn()}
      />,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('applies a custom variant, size, and className when provided', () => {
    render(
      <ResendCodeButton
        label="Gửi lại"
        pending={false}
        remainingSeconds={0}
        onClick={vi.fn()}
        variant="outline"
        size="sm"
        className="min-w-32"
      />,
    );

    const button = screen.getByRole('button', { name: 'Gửi lại' });
    expect(button.className).toContain('min-w-32');
    expect(button.className).toContain('border');
  });
});
