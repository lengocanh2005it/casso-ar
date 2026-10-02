import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthStatusCard } from './auth-status-card';

describe('AuthStatusCard', () => {
  it('renders the Casso AR logo link and the given content', () => {
    render(
      <MemoryRouter>
        <AuthStatusCard>
          <p>Kiểm tra email</p>
        </AuthStatusCard>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /casso ar/i })).toBeVisible();
    expect(screen.getByText('Kiểm tra email')).toBeVisible();
    expect(screen.getByRole('main')).toBeVisible();
  });

  it('fills the empty desktop gutters with the product promise', () => {
    render(
      <MemoryRouter>
        <AuthStatusCard>
          <p>Kiểm tra email</p>
        </AuthStatusCard>
      </MemoryRouter>,
    );

    const aside = screen.getByRole('complementary', {
      name: 'Casso AR giải quyết gì',
      hidden: true,
    });
    expect(aside).toHaveTextContent('đối chiếu');
    expect(aside).toHaveTextContent('Nhắc nợ');
    expect(aside).toHaveTextContent('Báo cáo');
  });

  it('hides the promise aside on small screens and states a bounded card width', () => {
    render(
      <MemoryRouter>
        <AuthStatusCard>
          <p>Kiểm tra email</p>
        </AuthStatusCard>
      </MemoryRouter>,
    );

    // The aside only appears from `lg` up; below that the card must be the
    // whole column and keep an explicit max width so it never stretches.
    const aside = screen.getByRole('complementary', {
      name: 'Casso AR giải quyết gì',
      hidden: true,
    });
    expect(aside).toHaveClass('hidden');
    expect(aside).toHaveClass('lg:block');

    const card = screen.getByRole('main').querySelector('.rounded-xl');
    expect(card).toHaveClass('w-full');
    expect(card).toHaveClass('max-w-md');
    expect(card).toHaveClass('lg:w-[28rem]');
  });
});
