import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/contexts/auth-context';
import { ThemeProvider } from '@/contexts/theme-context';
import { AdminLayout } from './admin-layout';

vi.mock('@/contexts/auth-context', () => ({ useAuth: vi.fn() }));
vi.mock('@/features/exceptions/api/use-review-count', () => ({
  useReviewCount: () => ({ data: 0 }),
}));

const useAuthMock = vi.mocked(useAuth);

function renderLayout() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin/dashboard']}>
          <Routes>
            <Route element={<AdminLayout />}>
              <Route path="/admin/dashboard" element={<div>Dashboard</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('AdminLayout', () => {
  it('provides a skip link and visible navigation feedback', () => {
    useAuthMock.mockReturnValue({
      user: null,
      logout: vi.fn(),
    } as never);

    renderLayout();

    expect(
      screen.getByRole('link', { name: /đi tới nội dung/i }),
    ).toHaveAttribute('href', '#admin-main-content');
    expect(screen.getByRole('main')).toHaveAttribute(
      'id',
      'admin-main-content',
    );
    expect(screen.getByRole('link', { name: 'Tổng quan' })).toHaveClass(
      'pointer-hover:hover:bg-primary/5',
    );
  });

  it('shows a working sign-out control for the operator', () => {
    useAuthMock.mockReturnValue({
      user: null,
      logout: vi.fn(),
    } as never);

    renderLayout();

    expect(
      screen.getAllByRole('button', { name: /đăng xuất/i }).length,
    ).toBeGreaterThan(0);
  });

  it('offers the theme toggle on desktop as well as in the mobile header', () => {
    useAuthMock.mockReturnValue({
      user: null,
      logout: vi.fn(),
    } as never);

    renderLayout();

    // The operator uses the admin portal from a desktop browser, where the
    // mobile-only header never renders. Without a desktop-visible toggle the
    // theme is stuck on whatever was last set on another device.
    const toggles = screen.getAllByRole('button', { name: /giao diện/i });
    expect(toggles.length).toBeGreaterThanOrEqual(2);
    // One lives in the mobile header, the other inside the desktop sidebar.
    expect(
      toggles.filter((toggle) => toggle.closest('aside') !== null).length,
    ).toBe(1);
  });
});
