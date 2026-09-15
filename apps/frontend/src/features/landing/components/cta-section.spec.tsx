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

  it('drives the branded card from theme-aware primary tokens with no dark overrides', () => {
    render(
      <MemoryRouter>
        <CtaSection />
      </MemoryRouter>,
    );

    const heading = screen.getByRole('heading', {
      name: 'Sẵn sàng quản lý công nợ dễ dàng hơn?',
    });
    const card = heading.parentElement as HTMLElement;

    // --primary inverts to a light green in dark mode and --primary-foreground
    // to a dark green, so the tokens already carry correct contrast in both
    // themes. Hard-coding white would flip it. Assert the overrides are gone.
    expect(card).toHaveClass('bg-primary', 'text-primary-foreground');
    expect(card).not.toHaveClass('dark:text-white');
    const copy = screen.getByText(
      'Tạo tài khoản miễn phí và bắt đầu ngay hôm nay.',
    );
    expect(copy).toHaveClass('text-primary-foreground/90');
    expect(copy).not.toHaveClass('dark:text-white/90');

    const signup = screen.getByRole('link', { name: /dùng thử miễn phí/i });
    expect(signup).not.toHaveClass(
      'dark:bg-white',
      'dark:text-primary',
      'dark:pointer-hover:hover:bg-white/90',
    );

    const login = screen.getByRole('link', { name: /đã có tài khoản/i });
    expect(login).toHaveClass('text-primary-foreground');
    expect(login).not.toHaveClass(
      'dark:border-white/40',
      'dark:text-white',
      'dark:pointer-hover:hover:bg-white/10',
    );
  });
});
