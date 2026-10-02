import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, 'index.css'), 'utf8');

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf('}', start));
}

describe('theme tokens', () => {
  it('defines a readable warning ink for both themes', () => {
    // warning-foreground is ink for text ON a solid warning fill; amber text
    // on a card or a translucent warning tint needs its own darker/lighter ink.
    expect(block(':root')).toMatch(/--warning-strong:/);
    expect(block('.dark')).toMatch(/--warning-strong:/);
    expect(css).toMatch(/--color-warning-strong: var\(--warning-strong\);/);
  });

  it('keeps primary readable as a fill and as ink in the light theme', () => {
    // oklch(0.635 0.168 155) measured 3.14:1 for white ink on the fill — below
    // the 4.5 floor — and hover:bg-primary/90 dropped it to 2.82. L=0.49
    // clears both: 5.49 at rest, 4.55 once the hover alpha is composited.
    expect(block(':root')).toMatch(/--primary:\s*oklch\(0\.49 0\.168 155\)/);
  });
});
