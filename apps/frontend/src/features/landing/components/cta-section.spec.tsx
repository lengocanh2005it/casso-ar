import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CtaSection } from './cta-section';

describe('CtaSection', () => {
  it('links the primary CTA to signup and the secondary to login', () => {
    render(
      <MemoryRouter>
        <CtaSection />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('link', { name: /dùng thử miễn phí/i }),
    ).toHaveAttribute('href', '/signup');
    expect(
      screen.getByRole('link', { name: /đã có tài khoản/i }),
    ).toHaveAttribute('href', '/login');
  });
});
