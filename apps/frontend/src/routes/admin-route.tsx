import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { authTokenManager, isOperatorToken } from '@/lib/api-client';

export function AdminRoute({ children }: { children: ReactNode }) {
  const token = authTokenManager.getAccessToken();
  if (!token || !isOperatorToken(token)) {
    return <Navigate to="/admin/login" replace />;
  }
  return children;
}
