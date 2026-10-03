import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppearanceTab } from './appearance-tab';

const { setTheme, useTheme } = vi.hoisted(() => ({
  setTheme: vi.fn(),
  useTheme: vi.fn(),
}));

vi.mock('@/contexts/theme-context', () => ({ useTheme }));

describe('AppearanceTab', () => {
  it('shows the real desktop and mobile product captures for the resolved theme', () => {
    useTheme.mockReturnValue({
      theme: 'system',
      resolvedTheme: 'dark',
      setTheme,
    });

    render(<AppearanceTab />);

    expect(
      screen.getByRole('region', { name: 'Bản xem trước giao diện tối' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Giao diện thật Casso AR chế độ tối' }),
    ).toHaveAttribute('src', '/appearance-preview-desktop-dark.jpg');
    expect(screen.getByTestId('mobile-preview-source')).toHaveAttribute(
      'srcset',
      '/appearance-preview-mobile-dark.jpg',
    );
    expect(screen.getByTestId('mobile-preview-source')).toHaveAttribute(
      'media',
      '(max-width: 767px)',
    );
    expect(
      screen.getByRole('button', { name: /Hệ thống.*Đang dùng/ }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses the existing real light dashboard capture on desktop and a mobile capture on small screens', () => {
    useTheme.mockReturnValue({
      theme: 'light',
      resolvedTheme: 'light',
      setTheme,
    });

    render(<AppearanceTab />);

    expect(
      screen.getByRole('img', { name: 'Giao diện thật Casso AR chế độ sáng' }),
    ).toHaveAttribute('src', '/showcase-dashboard.png');
    expect(screen.getByTestId('mobile-preview-source')).toHaveAttribute(
      'srcset',
      '/appearance-preview-mobile-light.jpg',
    );
  });

  it('updates the selected appearance mode when a theme option is chosen', () => {
    useTheme.mockReturnValue({
      theme: 'light',
      resolvedTheme: 'light',
      setTheme,
    });

    render(<AppearanceTab />);
    fireEvent.click(screen.getByRole('button', { name: /Tối/ }));

    expect(setTheme).toHaveBeenCalledWith('dark');
  });
});
