import { AboutSection } from '../components/about-section';
import { CtaSection } from '../components/cta-section';
import { FeaturesSection } from '../components/features-section';
import { HeroSection } from '../components/hero-section';
import { ProductShowcase } from '../components/product-showcase';
import { LandingFooter } from '../components/landing-footer';
import { LandingNavbar } from '../components/landing-navbar';
import { PricingSection } from '../components/pricing-section';
import { StatsBand } from '../components/stats-band';
import { StepsSection } from '../components/steps-section';

export function LandingPage() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-4 focus-visible:left-4 focus-visible:z-[100] focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-primary-foreground"
      >
        Bỏ qua để đến nội dung chính
      </a>
      <LandingNavbar />
      <main id="main-content">
        <HeroSection />
        <ProductShowcase />
        <AboutSection />
        <StatsBand />
        <FeaturesSection />
        <StepsSection />
        <PricingSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
