import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Matches `import { A, B, type C } from '@nestjs/common'` and captures the
// specifier list, so we can flag ANY imported exception class (not just a
// hardcoded handful) — per .claude/rules/application.md, application/ must
// not throw HttpException or any other @nestjs/common exception class.
const NESTJS_COMMON_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]@nestjs\/common['"]/g;

function findExceptionImports(content) {
  const found = [];
  for (const match of content.matchAll(NESTJS_COMMON_IMPORT)) {
    const specifiers = match[1].split(',').map((s) => s.trim());
    for (const specifier of specifiers) {
      if (!specifier) continue;
      const name = specifier.replace(/^type\s+/, '').trim();
      if (name.endsWith('Exception')) {
        found.push(name);
      }
    }
  }
  return found;
}

const modulesDir = join(process.cwd(), 'src', 'modules');

function collectTsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectTsFiles(full));
    } else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) {
      files.push(full);
    }
  }
  return files;
}

const violations = [];
for (const moduleName of readdirSync(modulesDir)) {
  const appDir = join(modulesDir, moduleName, 'application');
  let isDir = false;
  try {
    isDir = statSync(appDir).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) continue;

  for (const file of collectTsFiles(appDir)) {
    const content = readFileSync(file, 'utf8');
    for (const name of findExceptionImports(content)) {
      violations.push(`${file}: uses ${name} — throw AppError instead (see common/errors/app-error.ts)`);
    }
  }
}

if (violations.length > 0) {
  console.error('Application layer boundary violations found:\n');
  for (const violation of violations) {
    console.error(`  ${violation}`);
  }
  console.error(
    '\napplication/ must throw AppError, not @nestjs/common exception classes.',
  );
  process.exit(1);
}

console.log('Application layer boundary check passed.');
