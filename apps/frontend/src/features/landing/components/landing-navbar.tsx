import { Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { LANDING_NAV_LINKS } from '../landing-data';

function scrollToSection(href: string) {
  const id = href.replace('#', '');
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled
          ? 'border-b border-border/60 bg-background/85 shadow-sm backdrop-blur-xl'
          : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          to="/"
          className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo className="hidden h-9 sm:block" />
          <Logo variant="icon" className="h-9 sm:hidden" />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LANDING_NAV_LINKS.map((link) => (
            <Button
              key={link.href}
              variant="ghost"
              size="sm"
              className="min-h-11 text-muted-foreground hover:text-foreground"
              onClick={() => scrollToSection(link.href)}
            >
              {link.label}
            </Button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle className="hidden size-11 sm:inline-flex" />
          <Button
            variant="ghost"
            size="sm"
            className="hidden min-h-11 sm:inline-flex"
            asChild
          >
            <Link to="/login">Đăng nhập</Link>
          </Button>
          <Button size="sm" className="hidden min-h-11 sm:inline-flex" asChild>
            <Link to="/signup">Dùng thử miễn phí</Link>
          </Button>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="md:hidden"
                aria-label="Mở menu"
              >
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[min(100vw-2rem,20rem)]">
              <div className="flex items-center gap-2 text-left text-lg font-semibold">
                <Logo variant="icon" className="h-7" />
                Casso Ledger
              </div>
              <div className="mt-6 flex flex-col gap-2">
                {LANDING_NAV_LINKS.map((link) => (
                  <Button
                    key={link.href}
                    variant="ghost"
                    className="min-h-11 justify-start"
                    onClick={() => {
                      setMobileOpen(false);
                      scrollToSection(link.href);
                    }}
                  >
                    {link.label}
                  </Button>
                ))}
                <div className="my-2 border-t" />
                <Button
                  variant="outline"
                  className="min-h-11"
                  asChild
                  onClick={() => setMobileOpen(false)}
                >
                  <Link to="/login">Đăng nhập</Link>
                </Button>
                <Button
                  className="min-h-11"
                  asChild
                  onClick={() => setMobileOpen(false)}
                >
                  <Link to="/signup">Dùng thử miễn phí</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
