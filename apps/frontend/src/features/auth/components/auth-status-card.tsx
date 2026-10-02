import type { ReactNode } from 'react';
import { AuthLogoLink } from './auth-logo-link';

interface AuthStatusCardProps {
  children: ReactNode;
  /** Onboarding carries a wider bank-connection picker than the plain forms. */
  widthClassName?: string;
}

export function AuthStatusCard({
  children,
  widthClassName = 'max-w-md',
}: AuthStatusCardProps) {
  return (
    <main
      data-testid="auth-surface"
      className="flex min-h-svh items-center justify-center bg-gradient-to-br from-emerald-50 via-background to-teal-50 p-4 dark:from-emerald-950/20 dark:via-background dark:to-teal-950/20 sm:p-6"
    >
      <div
        className={`w-full space-y-5 rounded-xl border-primary/10 bg-card/95 p-6 text-center shadow-lg shadow-primary/5 backdrop-blur sm:p-7 ${widthClassName}`}
      >
        <AuthLogoLink />
        {children}
      </div>
    </main>
  );
}
