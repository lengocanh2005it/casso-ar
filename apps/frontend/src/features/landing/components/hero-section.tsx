import { useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import Typewriter from 'typewriter-effect';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import {
  LANDING_HEADLINE_PHRASES,
  LANDING_HERO_ASSURANCES,
} from '../landing-data';

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
    <section className="relative isolate flex min-h-svh items-center overflow-hidden pt-20 pb-8 sm:pt-28 sm:pb-12">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-12 -z-10 mx-auto h-80 max-w-5xl rounded-full bg-primary/10 blur-3xl"
      />
      {/* `grid-cols-1` uses a `minmax(auto, 1fr)` track that refuses to shrink
          below its content, so the rotating headline (which cannot break at
          390px) pushed the whole hero 43px past the viewport. An explicit
          `minmax(0, 1fr)` track can shrink, so the text wraps instead. */}
      <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)] items-center gap-6 px-4 sm:gap-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20 lg:px-8">
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
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground text-pretty sm:mt-5 lg:mx-0">
            Giao dịch ngân hàng về tới đâu, đối chiếu công nợ tới đó — không cần
            đợi kế toán nhập tay từng dòng.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:mt-8 sm:flex-row sm:justify-center lg:justify-start">
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
          <ul
            aria-label="Cam kết khi dùng thử"
            className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground sm:mt-10"
          >
            {LANDING_HERO_ASSURANCES.map((assurance) => (
              <li
                key={assurance.label}
                className="flex items-center gap-2 text-left"
              >
                <Check
                  className="size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span>
                  {assurance.label}
                  <span> — {assurance.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <figure
          aria-label="Màn hình Casso AR"
          className="relative mx-auto aspect-[1.7/1] w-full max-w-2xl sm:aspect-[1.55/1] lg:aspect-[1.35/1]"
        >
          <div className="absolute left-[9%] top-[2%] z-0 w-[76%] -rotate-2 overflow-hidden rounded-lg border border-border/70 bg-card shadow-lg transition-[transform,translate,scale,box-shadow] duration-300 ease-out motion-reduce:transition-none pointer-hover:hover:z-30 motion-safe:pointer-hover:hover:scale-[1.025] motion-safe:pointer-hover:hover:-translate-y-1">
            <img
              src="/hero-dashboard.png"
              alt="Tổng quan công nợ của Casso AR"
              width={1280}
              height={720}
              className="w-full"
              loading="eager"
            />
          </div>
          <div className="absolute right-0 top-[20%] z-10 w-[74%] rotate-2 overflow-hidden rounded-lg border border-border/70 bg-card shadow-xl shadow-primary/10 transition-[transform,translate,scale,box-shadow] duration-300 ease-out motion-reduce:transition-none pointer-hover:hover:z-30 motion-safe:pointer-hover:hover:scale-[1.025] motion-safe:pointer-hover:hover:-translate-y-1">
            <img
              src="/hero-copilot.png"
              alt="Màn hình Copilot của Casso AR"
              width={1280}
              height={720}
              className="w-full"
              loading="eager"
            />
          </div>
          <div className="absolute bottom-[1%] left-0 z-20 w-[78%] overflow-hidden rounded-lg border border-border/70 bg-card shadow-2xl shadow-primary/15 transition-[transform,translate,scale,box-shadow] duration-300 ease-out motion-reduce:transition-none pointer-hover:hover:z-30 motion-safe:pointer-hover:hover:scale-[1.025] motion-safe:pointer-hover:hover:-translate-y-1">
            <img
              src="/hero-receivables.jpg"
              alt="Giao diện công nợ của Casso AR: danh sách hóa đơn, số tiền còn lại và trạng thái thu hồi"
              width={1440}
              height={900}
              className="w-full"
              fetchPriority="high"
              loading="eager"
            />
          </div>
        </figure>
      </div>
    </section>
  );
}
