import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { LANDING_NAV_LINKS } from '../landing-data';
import { EASE_OUT } from '../motion-variants';

function scrollToSection(href: string) {
  const id = href.replace('#', '');
  document.getElementById(id)?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth',
    block: 'start',
  });
  window.history.replaceState(null, '', href);
}

function handleAnchorClick(
  event: React.MouseEvent<HTMLAnchorElement>,
  href: string,
) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
    return;
  }
  event.preventDefault();
  scrollToSection(href);
}

export function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none',
        scrolled
          ? 'border-b border-border/60 bg-background/85 shadow-sm backdrop-blur-xl'
          : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          to="/"
          aria-label="Casso Ledger — Trang chủ"
          className="inline-flex shrink-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo
            className="hidden sm:inline-flex"
            wordmarkClassName="text-primary"
          />
          <Logo variant="icon" className="h-9 sm:hidden" />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LANDING_NAV_LINKS.map((link) => (
            <Button
              key={link.href}
              variant="ghost"
              size="sm"
              className="min-h-11 px-3 text-[15px] text-muted-foreground pointer-hover:hover:text-foreground"
              asChild
            >
              <a
                href={link.href}
                onClick={(event) => handleAnchorClick(event, link.href)}
              >
                {link.label}
              </a>
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
                <Menu aria-hidden="true" className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[min(100vw-2rem,20rem)] overscroll-contain p-6">
              <AnimatePresence>
                {mobileOpen ? (
                  <motion.div
                    initial={
                      reducedMotion
                        ? false
                        : { opacity: 0, transform: 'translateY(-8px)' }
                    }
                    animate={{ opacity: 1, transform: 'translateY(0px)' }}
                    exit={
                      reducedMotion
                        ? undefined
                        : { opacity: 0, transform: 'translateY(-8px)' }
                    }
                    transition={{ duration: 0.2, ease: EASE_OUT }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Logo
                        iconClassName="h-7 w-7"
                        wordmarkClassName="text-lg font-semibold"
                      />
                      <ThemeToggle className="size-9" />
                    </div>
                    <div className="mt-6 flex flex-col gap-2">
                      {LANDING_NAV_LINKS.map((link) => (
                        <Button
                          key={link.href}
                          variant="ghost"
                          className="min-h-11 justify-start"
                          asChild
                        >
                          <a
                            href={link.href}
                            onClick={(event) => {
                              if (
                                event.metaKey ||
                                event.ctrlKey ||
                                event.shiftKey ||
                                event.button !== 0
                              ) {
                                return;
                              }
                              setMobileOpen(false);
                              handleAnchorClick(event, link.href);
                            }}
                          >
                            {link.label}
                          </a>
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
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
