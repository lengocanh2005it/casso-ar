import type { Permission } from '@casso-ledger/shared-types';
import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';

function AuthLoading() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-md space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  );
}

function ForbiddenView() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Không có quyền truy cập</h1>
      <p className="text-muted-foreground">
        Tài khoản của bạn không có quyền xem trang này.
      </p>
      <Button asChild>
        <Link to="/dashboard">Về trang chính</Link>
      </Button>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) return <AuthLoading />;
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

export function PermissionRoute({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) return <AuthLoading />;
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!hasPermission(user.role, permission)) {
    return <ForbiddenView />;
  }
  return children;
}

export function GuestRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <AuthLoading />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return children;
}
