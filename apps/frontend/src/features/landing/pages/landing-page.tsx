import { AboutSection } from '../components/about-section';
import { CtaSection } from '../components/cta-section';
import { FeaturesSection } from '../components/features-section';
import { HeroSection } from '../components/hero-section';
import { LandingFooter } from '../components/landing-footer';
import { LandingNavbar } from '../components/landing-navbar';
import { PricingSection } from '../components/pricing-section';
import { StatsBand } from '../components/stats-band';
import { StepsSection } from '../components/steps-section';

export function LandingPage() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <LandingNavbar />
      <main>
        <HeroSection />
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
