import { describe, expect, it } from 'vitest';
import { CHART_TICK, CHART_TOOLTIP_STYLE, STICKY_EDGE } from './chart';

describe('CHART_TICK', () => {
  it('reads its colour from a theme token so both modes stay legible', () => {
    expect(CHART_TICK.fill).toBe('var(--muted-foreground)');
  });
});

describe('CHART_TOOLTIP_STYLE', () => {
  // Recharts hardcodes a white tooltip background; unpinned, that renders
  // near-white text on white in dark mode. Every style must come from a token
  // that flips with the theme.
  it('never hardcodes a light colour', () => {
    const serialized = JSON.stringify(CHART_TOOLTIP_STYLE);

    expect(serialized).not.toMatch(/#fff|#000|#ccc|white|black/i);
  });

  it('draws its surface and text from dark/light-aware tokens', () => {
    expect(CHART_TOOLTIP_STYLE.contentStyle).toMatchObject({
      backgroundColor: 'var(--popover)',
      border: '1px solid var(--border)',
    });
    expect(CHART_TOOLTIP_STYLE.itemStyle).toMatchObject({
      color: 'var(--popover-foreground)',
    });
    expect(CHART_TOOLTIP_STYLE.labelStyle).toMatchObject({
      color: 'var(--muted-foreground)',
    });
  });
});

describe('STICKY_EDGE', () => {
  // A black shadow is invisible on the dark canvas, so the sticky column loses
  // its edge once the table scrolls horizontally.
  it('keeps the sticky column edge visible in dark mode', () => {
    expect(STICKY_EDGE).toMatch(/shadow-\[/);
    expect(STICKY_EDGE).not.toMatch(/rgb\(0_0_0/);
    expect(STICKY_EDGE).not.toMatch(/black/i);
  });
});
