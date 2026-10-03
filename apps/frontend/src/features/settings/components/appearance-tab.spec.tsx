import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppearanceTab } from './appearance-tab';

const { setTheme, useTheme } = vi.hoisted(() => ({
  setTheme: vi.fn(),
  useTheme: vi.fn(),
}));

vi.mock('@/contexts/theme-context', () => ({ useTheme }));

describe('AppearanceTab', () => {
  it('previews the real dashboard layout with skeletons instead of live values', () => {
    useTheme.mockReturnValue({
      theme: 'system',
      resolvedTheme: 'dark',
      setTheme,
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/settings?tab=appearance']}>
        <AppearanceTab />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Giao diện' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Chọn chế độ hiển thị cho ứng dụng.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Bản xem trước giao diện tối' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Trang chủ')).toBeInTheDocument();
    expect(screen.getByText('Tổng công nợ còn lại')).toBeInTheDocument();
    expect(screen.getByText('Cần đối soát')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-preview-canvas')).toHaveClass(
      'h-[440px]',
      'sm:h-[480px]',
      'overflow-hidden',
    );
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(7);
    expect(
      container.querySelector('[data-testid="dashboard-preview-canvas"] img'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-preview-canvas')).toHaveAttribute(
      'inert',
    );
    expect(screen.queryByText('616tr')).not.toBeInTheDocument();
    expect(screen.queryByText('320,8tr')).not.toBeInTheDocument();
    expect(screen.queryByText('52%')).not.toBeInTheDocument();
    expect(screen.queryByText('admin@antam.test')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Hệ thống.*Đang dùng/ }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the real dashboard structure while previewing the light mode', () => {
    useTheme.mockReturnValue({
      theme: 'light',
      resolvedTheme: 'light',
      setTheme,
    });

    render(
      <MemoryRouter initialEntries={['/settings?tab=appearance']}>
        <AppearanceTab />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('region', { name: 'Bản xem trước giao diện sáng' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Trang chủ')).toBeInTheDocument();
    expect(screen.getByText('Đang hiển thị: Sáng')).toBeInTheDocument();
    expect(screen.queryByText('616tr')).not.toBeInTheDocument();
  });

  it('keeps theme choices compact in a single row on narrow screens', () => {
    useTheme.mockReturnValue({
      theme: 'system',
      resolvedTheme: 'light',
      setTheme,
    });

    render(
      <MemoryRouter initialEntries={['/settings?tab=appearance']}>
        <AppearanceTab />
      </MemoryRouter>,
    );

    const options = screen.getByRole('group', { name: 'Chế độ giao diện' });
    expect(options).toHaveClass(
      'grid-cols-3',
      'xl:grid-cols-1',
      'content-start',
    );

    const lightOption = screen.getByRole('button', { name: /Sáng/ });
    expect(lightOption).toHaveClass('flex-col', 'min-h-16');
    expect(screen.getByText('Giao diện sáng')).toHaveClass(
      'sr-only',
      'sm:not-sr-only',
    );
  });

  it('updates the selected appearance mode when a theme option is chosen', () => {
    useTheme.mockReturnValue({
      theme: 'light',
      resolvedTheme: 'light',
      setTheme,
    });

    render(
      <MemoryRouter initialEntries={['/settings?tab=appearance']}>
        <AppearanceTab />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Tối/ }));

    expect(setTheme).toHaveBeenCalledWith('dark');
  });
});
