import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, 'index.css'), 'utf8');

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf('}', start));
}

function whiteContrastForOklch(value: string): number {
  const match = value.match(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/);
  if (!match) throw new Error(`Expected an OKLCH token, received: ${value}`);

  const [, lightnessText, chromaText, hueText] = match;
  const lightness = Number(lightnessText);
  const radians = (Number(hueText) * Math.PI) / 180;
  const a = Number(chromaText) * Math.cos(radians);
  const b = Number(chromaText) * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const red = Math.max(
    0,
    Math.min(1, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
  );
  const green = Math.max(
    0,
    Math.min(1, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
  );
  const blue = Math.max(
    0,
    Math.min(1, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  );
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

  return 1.05 / (luminance + 0.05);
}

describe('theme tokens', () => {
  it('keeps white text readable on the light primary color', () => {
    const primary = block(':root').match(/--primary:\s*(oklch\([^)]+\))/)?.[1];

    expect(primary).toBeDefined();
    expect(whiteContrastForOklch(primary ?? '')).toBeGreaterThanOrEqual(4.5);
  });

  it('defines a readable warning ink for both themes', () => {
    // warning-foreground is ink for text ON a solid warning fill; amber text
    // on a card or a translucent warning tint needs its own darker/lighter ink.
    expect(block(':root')).toMatch(/--warning-strong:/);
    expect(block('.dark')).toMatch(/--warning-strong:/);
    expect(css).toMatch(/--color-warning-strong: var\(--warning-strong\);/);
  });
});
