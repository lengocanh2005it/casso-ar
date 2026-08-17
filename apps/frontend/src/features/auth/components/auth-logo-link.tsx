import { Link } from 'react-router-dom';
import { Logo } from '@/components/logo';

export function AuthLogoLink() {
  return (
    <Link
      to="/"
      aria-label="Casso Ledger — Về trang chủ"
      className="inline-flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Logo className="h-7" wordmarkClassName="text-primary" />
    </Link>
  );
}
