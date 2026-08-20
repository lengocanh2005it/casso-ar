import type { ReactNode } from 'react';
import { AuthLogoLink } from './auth-logo-link';

interface AuthStatusCardProps {
  children: ReactNode;
}

export function AuthStatusCard({ children }: AuthStatusCardProps) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 text-center shadow-sm">
        <AuthLogoLink />
        {children}
      </div>
    </div>
  );
}
