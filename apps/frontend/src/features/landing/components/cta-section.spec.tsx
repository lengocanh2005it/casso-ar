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

  it('keeps the CTA copy white in dark mode', () => {
    render(
      <MemoryRouter>
        <CtaSection />
      </MemoryRouter>,
    );

    const heading = screen.getByRole('heading', {
      name: 'Sẵn sàng quản lý công nợ dễ dàng hơn?',
    });

    expect(heading.parentElement).toHaveClass('dark:text-white');
    expect(
      screen.getByText('Tạo tài khoản miễn phí và bắt đầu ngay hôm nay.'),
    ).toHaveClass('dark:text-white/90');
    expect(screen.getByRole('link', { name: /đã có tài khoản/i })).toHaveClass(
      'dark:text-white',
    );
  });

  it('uses high-contrast CTA controls in dark mode', () => {
    render(
      <MemoryRouter>
        <CtaSection />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('link', { name: /dùng thử miễn phí/i }),
    ).toHaveClass(
      'dark:bg-white',
      'dark:text-primary',
      'dark:pointer-hover:hover:bg-white/90',
    );
    expect(screen.getByRole('link', { name: /đã có tài khoản/i })).toHaveClass(
      'dark:border-white/40',
      'dark:text-white',
      'dark:pointer-hover:hover:bg-white/10',
    );
  });
});
