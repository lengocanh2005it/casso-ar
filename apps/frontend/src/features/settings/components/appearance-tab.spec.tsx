import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppearanceTab } from './appearance-tab';

const { setTheme, useTheme } = vi.hoisted(() => ({
  setTheme: vi.fn(),
  useTheme: vi.fn(),
}));

vi.mock('@/contexts/theme-context', () => ({ useTheme }));

describe('AppearanceTab', () => {
  it('shows a live product preview for the resolved theme', () => {
    useTheme.mockReturnValue({
      theme: 'system',
      resolvedTheme: 'dark',
      setTheme,
    });

    render(<AppearanceTab />);

    expect(
      screen.getByRole('region', { name: 'Bản xem trước giao diện tối' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Casso AR')).toBeInTheDocument();
    expect(screen.getByText('Bảng công nợ')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Hệ thống.*Đang dùng/ }),
    ).toHaveAttribute('aria-pressed', 'true');
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
