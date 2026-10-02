import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LandingFooter } from './landing-footer';

describe('LandingFooter', () => {
  it('renders the logo, landing navigation, and auth links', () => {
    render(
      <MemoryRouter>
        <LandingFooter />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('link', { name: 'Casso AR — Trang chủ' }),
    ).toHaveAttribute('href', '/');
    expect(
      screen.getByRole('navigation', { name: 'Điều hướng cuối trang' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Giới thiệu' })).toHaveAttribute(
      'href',
      '#gioi-thieu',
    );
    expect(screen.getByRole('link', { name: 'Sản phẩm' })).toHaveAttribute(
      'href',
      '#san-pham',
    );
    expect(screen.getByRole('link', { name: 'Tính năng' })).toHaveAttribute(
      'href',
      '#tinh-nang',
    );
    expect(
      screen.getByRole('link', { name: 'Cách hoạt động' }),
    ).toHaveAttribute('href', '#cach-hoat-dong');
    expect(screen.getByRole('link', { name: 'Bảng giá' })).toHaveAttribute(
      'href',
      '#bang-gia',
    );
    expect(screen.getByRole('link', { name: /đăng nhập/i })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByRole('link', { name: /đăng ký/i })).toHaveAttribute(
      'href',
      '/signup',
    );
  });
});
