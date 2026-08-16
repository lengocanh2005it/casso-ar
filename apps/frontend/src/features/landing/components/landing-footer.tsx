import { Link } from 'react-router-dom';
import { Logo } from '@/components/logo';

export function LandingFooter() {
  return (
    <footer className="border-t border-border/60 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
        <Logo className="h-7" />
        <p className="text-base text-muted-foreground">
          © {new Date().getFullYear()} Casso Ledger. Đã đăng ký bản quyền.
        </p>
        <div className="flex items-center gap-4 text-base">
          <Link
            to="/login"
            className="inline-flex min-h-11 items-center rounded-md text-muted-foreground pointer-hover:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Đăng nhập
          </Link>
          <Link
            to="/signup"
            className="inline-flex min-h-11 items-center rounded-md text-muted-foreground pointer-hover:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Đăng ký
          </Link>
        </div>
      </div>
    </footer>
  );
}
