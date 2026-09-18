import { Permission } from '@casso-ar/shared-types';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/contexts/auth-context';
import { OnboardingRoute, PermissionRoute } from './protected-route';

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

function renderOnboardingRoute(
  path: '/dashboard' | '/bank-connections',
  user: { role: string; bankingLinked: boolean },
) {
  useAuthMock.mockReturnValue({
    user,
    isLoading: false,
    isAuthenticated: true,
  } as never);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/dashboard"
          element={
            <OnboardingRoute>
              <div>dashboard content</div>
            </OnboardingRoute>
          }
        />
        <Route
          path="/bank-connections"
          element={
            <OnboardingRoute>
              <div>bank connections content</div>
            </OnboardingRoute>
          }
        />
        <Route path="/onboarding" element={<div>onboarding page</div>} />
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

  it('renders children for a viewer', () => {
    renderPermissionRoute({ role: 'VIEWER' });
    expect(screen.getByText('audit content')).toBeInTheDocument();
  });

  it('redirects an unauthenticated visitor to login', () => {
    renderPermissionRoute(null);
    expect(screen.getByText('login')).toBeInTheDocument();
  });
});

describe('OnboardingRoute', () => {
  it('redirects an unlinked organization route to onboarding', () => {
    renderOnboardingRoute('/dashboard', {
      role: 'OWNER',
      bankingLinked: false,
    });

    expect(screen.getByText('onboarding page')).toBeInTheDocument();
    expect(screen.queryByText('dashboard content')).not.toBeInTheDocument();
  });

  it('renders organization routes for a linked organization', () => {
    renderOnboardingRoute('/dashboard', {
      role: 'OWNER',
      bankingLinked: true,
    });

    expect(screen.getByText('dashboard content')).toBeInTheDocument();
  });

  it('keeps bank connections accessible before onboarding is complete', () => {
    renderOnboardingRoute('/bank-connections', {
      role: 'OWNER',
      bankingLinked: false,
    });

    expect(screen.getByText('bank connections content')).toBeInTheDocument();
  });
});
