import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RevealApiKeyDialog } from './reveal-api-key-dialog';

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock('../api/use-bank-connections', () => ({
  useRevealCassoFlowApiKey: () => ({ mutateAsync, isPending: false }),
}));

describe('RevealApiKeyDialog', () => {
  it('reveals the API key after submitting the password', async () => {
    mutateAsync.mockResolvedValueOnce({ apiKey: 'AK_CS.real-key' });

    render(<RevealApiKeyDialog authorizationId="auth-1" />);
    fireEvent.click(screen.getByRole('button', { name: /hiện api key/i }));
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));

    await waitFor(() =>
      expect(screen.getByDisplayValue('AK_CS.real-key')).toBeInTheDocument(),
    );
    expect(mutateAsync).toHaveBeenCalledWith({
      authorizationId: 'auth-1',
      password: 'correct-password',
    });
  });

  it('clears the revealed key when the dialog is closed', async () => {
    mutateAsync.mockResolvedValueOnce({ apiKey: 'AK_CS.real-key' });

    render(<RevealApiKeyDialog authorizationId="auth-1" />);
    fireEvent.click(screen.getByRole('button', { name: /hiện api key/i }));
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));
    await waitFor(() =>
      expect(screen.getByDisplayValue('AK_CS.real-key')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    fireEvent.click(screen.getByRole('button', { name: /hiện api key/i }));

    expect(
      screen.queryByDisplayValue('AK_CS.real-key'),
    ).not.toBeInTheDocument();
  });
});
