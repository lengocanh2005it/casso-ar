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
});
