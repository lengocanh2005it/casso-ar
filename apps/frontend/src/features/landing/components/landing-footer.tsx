import { Link } from 'react-router-dom';
import { Logo } from '@/components/logo';
import { LANDING_NAV_LINKS } from '../landing-data';

const FOOTER_LINK_CLASS =
  'inline-flex min-h-11 items-center rounded-md text-sm text-muted-foreground transition-colors pointer-hover:hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function LandingFooter() {
  return (
    <footer className="border-t border-border/60 bg-muted/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(12rem,1fr)_minmax(10rem,0.7fr)] lg:gap-16 lg:py-14">
          <div className="max-w-sm">
            <Link
              to="/"
              aria-label="Casso AR — Trang chủ"
              className="inline-flex min-h-11 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Logo className="h-7" wordmarkClassName="text-primary" />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground">
              Quản lý công nợ, đối soát thanh toán và nhắc nợ tự động trên cùng
              một nền tảng.
            </p>
          </div>

          <nav aria-label="Điều hướng cuối trang">
            <h2 className="text-sm font-semibold text-foreground">Khám phá</h2>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 sm:grid-cols-1 sm:gap-x-0">
              {LANDING_NAV_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <a className={FOOTER_LINK_CLASS} href={href}>
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Tài khoản">
            <h2 className="text-sm font-semibold text-foreground">Tài khoản</h2>
            <ul className="mt-3">
              <li>
                <Link className={FOOTER_LINK_CLASS} to="/login">
                  Đăng nhập
                </Link>
              </li>
              <li>
                <Link className={FOOTER_LINK_CLASS} to="/signup">
                  Đăng ký
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="flex flex-col gap-2 border-t border-border/60 py-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Casso AR. Đã đăng ký bản quyền.</p>
          <p>Quản lý công nợ cho doanh nghiệp Việt Nam</p>
        </div>
      </div>
    </footer>
  );
}
