import type { PlanId, Role } from '@casso-ledger/shared-types';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { apiRequest, authTokenManager } from '@/lib/api-client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string;
  organizationName: string;
  subscriptionPlan: PlanId;
}

interface AuthContextValue {
  user: AuthenticatedUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const token = await authTokenManager.getValidAccessToken();
        if (!token) return;

        const me = await apiRequest<AuthenticatedUser>({
          url: '/api/v1/me',
          method: 'GET',
        });
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshUser = async (): Promise<void> => {
    const me = await apiRequest<AuthenticatedUser>({
      url: '/api/v1/me',
      method: 'GET',
    });
    setUser(me);
  };

  const login = async (email: string, password: string): Promise<void> => {
    authTokenManager.resetLogoutState();
    const result = await apiRequest<{ accessToken: string }>({
      url: '/api/v1/auth/login',
      method: 'POST',
      data: { email, password },
    });
    authTokenManager.setAccessToken(result.accessToken);
    await refreshUser();
  };

  const logout = async (): Promise<void> => {
    authTokenManager.markLogoutInitiated();
    await authTokenManager.clearStaleRefreshSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: user !== null,
        refreshUser,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
