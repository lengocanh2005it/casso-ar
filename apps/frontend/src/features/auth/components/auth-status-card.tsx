import type { ReactNode } from 'react';
import { AuthLogoLink } from './auth-logo-link';
import { AuthPromiseAside } from './auth-promise-aside';

interface AuthStatusCardProps {
  children: ReactNode;
  /** Onboarding carries a wider bank-connection picker than the plain forms. */
  widthClassName?: string;
}

export function AuthStatusCard({
  children,
  // A grid `auto` track sizes to the card's max-content, which collapses the
  // full-width inputs — so the desktop width is stated explicitly too.
  widthClassName = 'max-w-md lg:w-[28rem]',
}: AuthStatusCardProps) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-gradient-to-br from-emerald-50 via-background to-teal-50 p-4 dark:from-emerald-950/20 dark:via-background dark:to-teal-950/20 sm:p-6">
      <div className="grid w-full max-w-5xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
        <AuthPromiseAside />
        <div
          className={`mx-auto w-full space-y-5 rounded-xl border-primary/10 bg-card p-6 text-center shadow-xl shadow-primary/20 backdrop-blur sm:p-7 ${widthClassName}`}
        >
          <AuthLogoLink />
          {children}
        </div>
      </div>
    </main>
  );
}
