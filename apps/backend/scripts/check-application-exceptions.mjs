import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = [
  'HttpException',
  'NotFoundException',
  'UnauthorizedException',
  'BadRequestException',
  'ConflictException',
  'ForbiddenException',
];

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
    for (const name of FORBIDDEN) {
      if (new RegExp(`\\b${name}\\b`).test(content)) {
        violations.push(`${file}: uses ${name} — throw AppError instead (see common/errors/app-error.ts)`);
      }
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
