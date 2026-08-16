import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LandingFooter } from './landing-footer';

describe('LandingFooter', () => {
  it('renders the logo and auth links', () => {
    render(
      <MemoryRouter>
        <LandingFooter />
      </MemoryRouter>,
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
