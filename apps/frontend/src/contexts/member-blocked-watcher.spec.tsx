import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MemberBlockedWatcher } from './member-blocked-watcher';

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock('@/contexts/auth-context', () => ({ useAuth }));

function renderWatcher() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<MemberBlockedWatcher />} />
        <Route path="/login" element={<div>Trang đăng nhập</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MemberBlockedWatcher', () => {
  it('logs out and redirects to /login on the member-blocked event', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ logout });
    renderWatcher();

    window.dispatchEvent(new CustomEvent('casso:member-blocked'));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Trang đăng nhập')).toBeTruthy();
  });

  it('still redirects to /login when logout fails', async () => {
    const logout = vi.fn().mockRejectedValue(new Error('network down'));
    useAuth.mockReturnValue({ logout });
    renderWatcher();

    window.dispatchEvent(new CustomEvent('casso:member-blocked'));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Trang đăng nhập')).toBeTruthy();
  });
});
