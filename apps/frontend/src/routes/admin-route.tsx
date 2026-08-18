import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { authTokenManager, isOperatorToken } from '@/lib/api-client';
import { AuthLoading } from './protected-route';

export function AdminRoute({ children }: { children: ReactNode }) {
  const { isLoading } = useAuth();
  if (isLoading) return <AuthLoading />;

  const token = authTokenManager.getAccessToken();
  if (!token || !isOperatorToken(token)) {
    return <Navigate to="/admin/login" replace />;
  }
  return children;
}
