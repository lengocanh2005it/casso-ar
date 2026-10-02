import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InviteAcceptPage } from './invite-accept-page';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('@/lib/api-client', () => ({ apiRequest }));

describe('invite acceptance', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('shows the Casso AR logo like the other auth pages', () => {
    render(
      <MemoryRouter initialEntries={['/invite-accept?token=invite-token']}>
        <Routes>
          <Route path="/invite-accept" element={<InviteAcceptPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /casso ar/i })).toBeVisible();
  });

  it('accepts an invite with the invitee name and password', async () => {
    apiRequest.mockResolvedValue({ success: true });

    render(
      <MemoryRouter initialEntries={['/invite-accept?token=invite-token']}>
        <Routes>
          <Route path="/invite-accept" element={<InviteAcceptPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/họ và tên/i), {
      target: { value: 'Invitee Name' },
    });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /tham gia/i }));

    await waitFor(() =>
      expect(screen.getByText(/tham gia tổ chức thành công/i)).toBeVisible(),
    );
    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/invites/accept',
      method: 'POST',
      data: {
        token: 'invite-token',
        name: 'Invitee Name',
        password: 'secret123',
      },
    });
  });

  it('offers a way back to login when the invite is rejected', async () => {
    apiRequest.mockRejectedValue({ response: { data: {} } });

    render(
      <MemoryRouter initialEntries={['/invite-accept?token=expired-token']}>
        <Routes>
          <Route path="/invite-accept" element={<InviteAcceptPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/họ và tên/i), {
      target: { value: 'Invitee Name' },
    });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /tham gia/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/lời mời đã hết hạn hoặc không hợp lệ/i),
      ).toBeVisible(),
    );
    const escapeHatch = screen.getByRole('link', {
      name: /quay lại đăng nhập/i,
    });
    expect(escapeHatch).toHaveAttribute('href', '/login');
  });
});
