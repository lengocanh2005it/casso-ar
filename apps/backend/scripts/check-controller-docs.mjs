import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const API_TAGS_IMPORT = /import\s*\{[^}]*ApiTags[^}]*\}\s*from\s*['"]@nestjs\/swagger['"]/;
// @ApiTags must sit above the controller class decorator — a tag buried in a
// comment or on a method does not satisfy the requirement. Other decorators
// (e.g. @Public()) may sit between @ApiTags and @Controller.
const API_TAGS_ON_CONTROLLER =
  /@ApiTags\(\s*['"][^'"]+['"]\s*\)(?:\s*\n\s*@\w+(?:\([^)]*\))?)*\s*\n\s*@Controller\(/;

function collectControllerFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectControllerFiles(full));
    } else if (
      full.endsWith('.controller.ts') &&
      !full.endsWith('.spec.ts')
    ) {
      files.push(full);
    }
  }
  return files;
}

export function findControllerDocsViolations(sourceRoot) {
  const violations = [];
  for (const root of ['modules', 'common']) {
    const base = join(sourceRoot, root);
    if (!existsSync(base)) continue;
    for (const file of collectControllerFiles(base)) {
      const content = readFileSync(file, 'utf8');
      if (
        !API_TAGS_IMPORT.test(content) ||
        !API_TAGS_ON_CONTROLLER.test(content)
      ) {
        violations.push(file);
      }
    }
  }
  return violations;
}

const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  const violations = findControllerDocsViolations(join(process.cwd(), 'src'));
  if (violations.length > 0) {
    console.error('Controllers without @ApiTags found:\n');
    for (const violation of violations) {
      console.error(`  ${violation}`);
    }
    console.error(
      '\nEvery controller must carry @ApiTags("<tag>") so the API docs stay complete.',
    );
    process.exit(1);
  }
  console.log('Controller docs check passed.');
}
