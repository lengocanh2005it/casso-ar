import { render, screen } from '@testing-library/react';
import { LayoutDashboard, Settings } from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SidebarShell } from './sidebar-shell';

describe('SidebarShell', () => {
  it('can preview a different active route without changing the router location', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SidebarShell
          items={[
            { to: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
            { to: '/settings', label: 'Cài đặt', icon: Settings },
          ]}
          activePath="/dashboard"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Tổng quan' })).toHaveClass(
      'bg-primary/10',
    );
    expect(screen.getByRole('link', { name: 'Cài đặt' })).not.toHaveClass(
      'bg-primary/10',
    );
  });
});
