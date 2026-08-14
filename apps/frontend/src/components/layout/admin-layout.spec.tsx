import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AdminLayout } from './admin-layout';

vi.mock('@/features/admin/components/admin-status-rail', () => ({
  AdminStatusRail: () => <div>status</div>,
}));

describe('AdminLayout', () => {
  it('provides a skip link and visible navigation feedback', () => {
    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Routes>
          <Route element={<AdminLayout />}>
            <Route path="/admin/dashboard" element={<div>Dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('link', { name: /đi tới nội dung/i }),
    ).toHaveAttribute('href', '#admin-main-content');
    expect(screen.getByRole('main')).toHaveAttribute(
      'id',
      'admin-main-content',
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveClass(
      'pointer-hover:hover:bg-accent',
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveClass(
      'touch-manipulation',
    );
  });
});
