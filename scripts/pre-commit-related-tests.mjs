import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const BACKEND_SRC = 'apps/backend/src/';
const FRONTEND_SRC = 'apps/frontend/src/';
const SHARED_SRC = 'packages/shared-types/src/';

function stagedFiles() {
  const output = execSync('git diff --cached --name-only --diff-filter=ACMR', {
    encoding: 'utf8',
  });
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function run(label, command, cwd) {
  console.log(`[pre-commit] ${label}`);
  execSync(command, { cwd, stdio: 'inherit' });
}

function partition(files) {
  const specs = files.filter((file) => file.endsWith('.spec.ts'));
  return {
    specs: specs.map((file) => file.slice('apps/backend/'.length)),
    sources: files
      .filter((file) => !file.endsWith('.spec.ts'))
      .map((file) => file.slice('apps/backend/'.length)),
  };
}

const files = stagedFiles();
const backend = partition(
  files.filter((file) => file.startsWith(BACKEND_SRC) && file.endsWith('.ts')),
);
const frontendSpecs = files.filter(
  (file) =>
    file.startsWith(FRONTEND_SRC) &&
    (file.endsWith('.spec.ts') || file.endsWith('.spec.tsx')),
);
const frontendSources = files.filter(
  (file) =>
    file.startsWith(FRONTEND_SRC) &&
    /\.(ts|tsx)$/.test(file) &&
    !frontendSpecs.includes(file),
);
const shared = files.filter(
  (file) => file.startsWith(SHARED_SRC) && file.endsWith('.ts'),
);

let ran = false;

if (backend.specs.length > 0) {
  run(
    'backend specs',
    `npx jest --silent ${backend.specs.join(' ')}`,
    'apps/backend',
  );
  ran = true;
}
if (backend.sources.length > 0) {
  run(
    'backend related',
    `npx jest --silent --findRelatedTests ${backend.sources.join(' ')}`,
    'apps/backend',
  );
  ran = true;
}
if (frontendSpecs.length > 0) {
  run(
    'frontend specs',
    `npx vitest run ${frontendSpecs.map((file) => file.slice('apps/frontend/'.length)).join(' ')}`,
    'apps/frontend',
  );
  ran = true;
}
if (frontendSources.length > 0) {
  const siblingSpecs = [];
  const orphans = [];
  for (const file of frontendSources.map((item) =>
    item.slice('apps/frontend/'.length),
  )) {
    const sibling = file.replace(/\.(ts|tsx)$/, '.spec.$1');
    const siblingX = file.replace(/\.ts$/, '.spec.tsx');
    if (existsSync(`apps/frontend/${sibling}`)) {
      siblingSpecs.push(sibling);
    } else if (
      file.endsWith('.ts') &&
      existsSync(`apps/frontend/${siblingX}`)
    ) {
      siblingSpecs.push(siblingX);
    } else {
      orphans.push(file);
    }
  }
  if (siblingSpecs.length > 0) {
    run(
      'frontend related',
      `npx vitest run ${siblingSpecs.join(' ')}`,
      'apps/frontend',
    );
    ran = true;
  }
  if (orphans.length > 0) {
    run(
      'frontend related (fallback)',
      `npx vitest related --run ${orphans.join(' ')}`,
      'apps/frontend',
    );
    ran = true;
  }
}
if (shared.length > 0) {
  run(
    'shared-types related',
    `npx jest --silent --findRelatedTests ${shared.map((file) => file.slice('packages/shared-types/'.length)).join(' ')}`,
    'packages/shared-types',
  );
  ran = true;
}

if (!ran) {
  console.log('[pre-commit] no test-related staged files, skipping tests');
}
