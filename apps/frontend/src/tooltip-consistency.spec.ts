import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname);

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    // Specs are allowed to assert on `title`; they are not shipped UI.
    if (!/\.tsx?$/.test(entry) || /\.spec\.tsx?$/.test(entry)) continue;
    found.push(full);
  }
  return found;
}

/**
 * `title` means three different things in this codebase, and only one of
 * them is a tooltip:
 *
 * - a prop on our own components (`PageHeading`, `SectionCard`, `EmptyState`,
 *   `BulkConfirmDialog`) is the component's own API, not a browser hint;
 * - the required accessible name on `<iframe>`;
 * - everything else lands as a native browser tooltip on the DOM.
 *
 * A native `title` paints a bubble in the UA's own style, so it ignores the
 * app's light/dark tokens and showed up a second time beside the Radix
 * tooltip on hover: the duplicate the reports audit surfaced.
 */
const COMPONENT_TITLE_PROPS = new Set([
  'PageHeading',
  'SectionHeading',
  'SectionCard',
  'EmptyState',
  'ChartContainer',
  'CatalogAlert',
  'BulkConfirmDialog',
  'DialogTitle',
  'DialogDescription',
]);

/**
 * Match a `title=` attribute and the tag it belongs to.
 *
 * The attributes of a JSX element are spread across lines, and the gap
 * frequently contains an arrow function (`onClick={() => …}`). Scanning
 * backwards from the attribute to the nearest `<` or `>` — rather than
 * matching forwards with a character class — is what survives both.
 */
function openingTagNameAt(source: string, attributeIndex: number): string {
  // `onClick={() => …}` puts a `>` — an arrow, not a tag terminator — between
  // the tag name and the attributes we care about, so a plain "nearest `>` is
  // closer than the nearest `<`" check threw away every element with a handler.
  const before = source.slice(0, attributeIndex).replace(/=>/g, ' ');
  const tagStart = before.lastIndexOf('<');
  if (tagStart === -1 || tagStart < before.lastIndexOf('>')) return '';
  const name = /^<([A-Za-z][\w.]*)/.exec(before.slice(tagStart));
  return name?.[1] ?? '';
}

const TITLE_ATTRIBUTE = /\btitle=/g;

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

describe('tooltip consistency', () => {
  it('leaves no native title tooltip on DOM elements', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      const source = readFileSync(file, 'utf8');

      for (const match of source.matchAll(TITLE_ATTRIBUTE)) {
        const tag = openingTagNameAt(source, match.index);
        if (!tag) continue;
        // <iframe> needs its accessible name; that is not a tooltip.
        if (tag === 'iframe') continue;
        if (COMPONENT_TITLE_PROPS.has(tag)) continue;
        offenders.push(
          `${rel}:${lineOf(source, match.index)} <${tag} title=...>`,
        );
      }
    }

    expect(offenders).toEqual([]);
  });
});
