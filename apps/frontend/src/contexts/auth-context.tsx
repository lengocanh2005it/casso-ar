import type { PlanId, Role } from '@casso-ledger/shared-types';
import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { apiRequest, authTokenManager } from '@/lib/api-client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string;
  organizationName: string;
  subscriptionPlan: PlanId;
  bankingLinked: boolean;
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
          url: '/api/v1/auth/me',
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

  const refreshUser = useCallback(async (): Promise<void> => {
    const me = await apiRequest<AuthenticatedUser>({
      url: '/api/v1/auth/me',
      method: 'GET',
    });
    setUser(me);
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      authTokenManager.resetLogoutState();
      const result = await apiRequest<{ accessToken: string }>({
        url: '/api/v1/auth/login',
        method: 'POST',
        data: { email, password },
      });
      authTokenManager.setAccessToken(result.accessToken);
      try {
        await refreshUser();
      } catch {
        // login already succeeded (token issued); a failed profile load
        // right after must not be reported back as a failed login.
      }
    },
    [refreshUser],
  );

  const logout = useCallback(async (): Promise<void> => {
    authTokenManager.markLogoutInitiated();
    await authTokenManager.clearStaleRefreshSession();
    setUser(null);
  }, []);

  const contextValue = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      refreshUser,
      login,
      logout,
    }),
    [user, isLoading, refreshUser, login, logout],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
