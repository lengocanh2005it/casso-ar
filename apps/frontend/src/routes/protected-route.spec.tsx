import { Permission } from '@casso-ledger/shared-types';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/contexts/auth-context';
import { PermissionRoute } from './protected-route';

vi.mock('@/contexts/auth-context', () => ({
  useAuth: vi.fn(),
}));

const useAuthMock = vi.mocked(useAuth);

function renderPermissionRoute(user: { role: string } | null) {
  useAuthMock.mockReturnValue({
    user,
    isLoading: false,
    isAuthenticated: user !== null,
  } as never);
  return render(
    <MemoryRouter initialEntries={['/audit']}>
      <Routes>
        <Route
          path="/audit"
          element={
            <PermissionRoute permission={Permission.RECEIVABLE_AUDIT_READ}>
              <div>audit content</div>
            </PermissionRoute>
          }
        />
        <Route path="/dashboard" element={<div>dashboard</div>} />
        <Route path="/login" element={<div>login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PermissionRoute', () => {
  it('renders children for an owner', () => {
    renderPermissionRoute({ role: 'OWNER' });
    expect(screen.getByText('audit content')).toBeInTheDocument();
  });

  it('renders children for a finance manager', () => {
    renderPermissionRoute({ role: 'FINANCE_MANAGER' });
    expect(screen.getByText('audit content')).toBeInTheDocument();
  });

  it('shows the forbidden view for a viewer', () => {
    renderPermissionRoute({ role: 'VIEWER' });
    expect(screen.getByText('Không có quyền truy cập')).toBeInTheDocument();
    expect(screen.queryByText('audit content')).not.toBeInTheDocument();
  });

  it('redirects an unauthenticated visitor to login', () => {
    renderPermissionRoute(null);
    expect(screen.getByText('login')).toBeInTheDocument();
  });
});
