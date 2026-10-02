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
});
