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
    expect(screen.getByTestId('auth-surface')).toHaveClass('from-emerald-50');
  });

  it('narrows the card by default and widens it on request', () => {
    const { rerender } = render(
      <MemoryRouter>
        <AuthStatusCard>
          <p>Nội dung</p>
        </AuthStatusCard>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('auth-surface').firstElementChild).toHaveClass(
      'max-w-md',
    );

    rerender(
      <MemoryRouter>
        <AuthStatusCard widthClassName="max-w-lg">
          <p>Nội dung</p>
        </AuthStatusCard>
      </MemoryRouter>,
    );

    const card = screen.getByTestId('auth-surface').firstElementChild;
    expect(card).toHaveClass('max-w-lg');
    expect(card).not.toHaveClass('max-w-md');
  });
});
