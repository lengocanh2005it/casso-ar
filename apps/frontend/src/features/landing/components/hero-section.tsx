import { useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import Typewriter from 'typewriter-effect';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { LANDING_HEADLINE_PHRASES } from '../landing-data';
import { HeroDemoCard } from './hero-demo-card';

const TYPEWRITER_OPTIONS = {
  strings: [...LANDING_HEADLINE_PHRASES],
  autoStart: true,
  loop: true,
};

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

export function HeroSection() {
  const reducedMotion = useReducedMotion();

  return (
    <section className="pb-12 pt-24 sm:pb-16 sm:pt-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
        <div className="text-center lg:text-left">
          <Logo
            className="mb-4 rounded-full border border-border/70 bg-card px-3 py-1.5"
            iconClassName="h-4 w-4"
            wordmarkClassName="text-sm font-medium text-primary"
          />
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
            Thu tiền{' '}
            {reducedMotion ? (
              <span className="text-primary">
                {LANDING_HEADLINE_PHRASES[0]}
              </span>
            ) : (
              <span className="text-primary">
                <span aria-hidden="true">
                  <Typewriter options={TYPEWRITER_OPTIONS} />
                </span>
                <span className="sr-only">
                  {LANDING_HEADLINE_PHRASES.join(', ')}
                </span>
              </span>
            )}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground text-pretty lg:mx-0">
            Giao dịch ngân hàng về tới đâu, đối chiếu công nợ tới đó — không cần
            đợi kế toán nhập tay từng dòng.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Button size="lg" className="h-12 w-full px-8 sm:w-auto" asChild>
              <Link to="/signup">Dùng thử miễn phí</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 w-full sm:w-auto"
              asChild
            >
              {/* biome-ignore lint/a11y/useValidAnchor: real in-page anchor (href points at an existing #id) preserving Cmd/Ctrl/middle-click, not a fake "#" button */}
              <a
                href="#cach-hoat-dong"
                onClick={(event) => handleAnchorClick(event, '#cach-hoat-dong')}
              >
                Xem cách hoạt động
              </a>
            </Button>
          </div>
        </div>

        <HeroDemoCard />
      </div>
    </section>
  );
}
