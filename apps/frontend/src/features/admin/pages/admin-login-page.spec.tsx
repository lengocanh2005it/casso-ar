import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import * as adminApi from '../api/admin-api';
import { AdminLoginPage } from './admin-login-page';

vi.mock('../api/admin-api');

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminLoginPage />
    </MemoryRouter>,
  );
}

describe('AdminLoginPage', () => {
  it('provides autocomplete metadata for login fields', () => {
    renderPage();

    expect(
      screen.getByRole('link', { name: /đi tới nội dung/i }),
    ).toHaveAttribute('href', '#admin-login-content');
    expect(screen.getByRole('main')).toHaveAttribute(
      'id',
      'admin-login-content',
    );
    expect(screen.getByLabelText('Email')).toHaveAttribute('name', 'email');
    expect(screen.getByLabelText('Email')).toHaveAttribute(
      'autocomplete',
      'email',
    );
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute(
      'name',
      'password',
    );
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute(
      'autocomplete',
      'current-password',
    );
  });

  it('shows a pending label while login is in progress', () => {
    vi.mocked(adminApi.adminLogin).mockReturnValue(new Promise(() => {}));

    renderPage();
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'operator@casso.vn' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), {
      target: { value: 'password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(
      screen.getByRole('button', { name: /đang đăng nhập/i }),
    ).toBeDisabled();
  });

  it('announces a login error with a next step', async () => {
    vi.mocked(adminApi.adminLogin).mockRejectedValue(new Error('unauthorized'));

    renderPage();
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'operator@casso.vn' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), {
      target: { value: 'password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /kiểm tra thông tin và thử lại/i,
    );
  });

  it('explains why a real (non-operator) account was bounced back here', () => {
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/admin/login', state: { reason: 'not-operator' } },
        ]}
      >
        <AdminLoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      /tài khoản này không có quyền truy cập casso admin/i,
    );
  });
});
