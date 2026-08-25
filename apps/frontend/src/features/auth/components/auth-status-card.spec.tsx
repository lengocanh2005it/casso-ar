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
});
