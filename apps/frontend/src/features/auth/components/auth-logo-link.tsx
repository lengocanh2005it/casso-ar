import { Link } from 'react-router-dom';
import { Logo } from '@/components/logo';

export function AuthLogoLink() {
  return (
    <Link
      to="/"
      aria-label="Casso AR — Về trang chủ"
      className="inline-flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Logo className="h-7" wordmarkClassName="text-primary" />
    </Link>
  );
}
