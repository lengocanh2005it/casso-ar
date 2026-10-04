/**
 * One-off audit: find every JSX line carrying a `title` attribute and report
 * whether a Radix tooltip is opened nearby.
 *
 * The duplicate-tooltip bug was a `title` attribute sitting on top of a
 * `TooltipContent` describing the same string — hovering raised two bubbles.
 * Native `title` on its own is fine (one bubble), so this lists only the
 * dual-tooltip case so it cannot silently come back.
 *
 * Run: node scripts/audit-dual-tooltip.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src';

function tsxFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith('.tsx') && !/\.(spec|test)\.tsx$/.test(path)
      ? [path]
      : [];
  });
}

const files = tsxFiles(SRC);
const findings = [];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  if (!/\btitle=/.test(source)) continue;

  const lines = source.split('\n');
  for (const [index, line] of lines.entries()) {
    if (!/\btitle=/.test(line)) continue;

    const before = lines.slice(Math.max(0, index - 6), index).join('\n');
    const opensTooltip =
      /<Tooltip[\s>]/.test(before) || /<TooltipContent[\s>]/.test(before);

    if (opensTooltip) {
      findings.push(`${file}:${index + 1}  ${line.trim().slice(0, 70)}`);
    }
  }
}

if (findings.length > 0) {
  console.error(`Dual-tooltip sites found (${findings.length}):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exitCode = 1;
} else {
  console.log(`No dual-tooltip sites across ${files.length} tsx files.`);
}
