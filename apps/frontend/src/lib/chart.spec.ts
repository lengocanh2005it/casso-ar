import { describe, expect, it } from 'vitest';
import {
  CHART_TICK,
  CHART_TOOLTIP_STYLE,
  hasChartValue,
  moneyPercent,
  STICKY_EDGE,
} from './chart';

describe('hasChartValue', () => {
  it('treats numeric and decimal string zero as empty', () => {
    expect(hasChartValue([0, '0', '000', null])).toBe(false);
    expect(hasChartValue(['9007199254740993'])).toBe(true);
  });
});

describe('moneyPercent', () => {
  it('keeps chart geometry bounded without converting VND to Number', () => {
    expect(moneyPercent('9007199254740992', 9007199254740993n)).toBe(99.99);
    expect(moneyPercent('9007199254740993', 18014398509481986n)).toBe(50);
    expect(moneyPercent('18014398509481986', 9007199254740993n)).toBe(100);
    expect(moneyPercent('-9007199254740993', 9007199254740993n)).toBe(0);
  });
});

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
