import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const STATIC_IMPORT_OR_EXPORT = /\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;

function collectProductionTsFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const file = join(dir, entry);
    if (statSync(file).isDirectory()) return collectProductionTsFiles(file);
    return file.endsWith('.ts') && !file.endsWith('.spec.ts') ? [file] : [];
  });
}

function getLineNumber(content, offset) {
  return content.slice(0, offset).split('\n').length;
}

export function findCrossModuleInfrastructureViolations(sourceRoot) {
  return collectProductionTsFiles(sourceRoot).flatMap((file) => {
    const sourceModule = relative(sourceRoot, file).split(sep)[0];
    const content = readFileSync(file, 'utf8');
    const violations = [];

    for (const match of content.matchAll(STATIC_IMPORT_OR_EXPORT)) {
      const importPath = match[1];
      if (!importPath.startsWith('.')) continue;

      const targetParts = relative(sourceRoot, resolve(file, '..', importPath)).split(sep);
      if (
        targetParts[0] !== sourceModule &&
        targetParts[1] === 'infrastructure'
      ) {
        violations.push({
          file,
          line: getLineNumber(content, match.index),
          importPath,
        });
      }
    }

    return violations;
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sourceRoot = join(process.cwd(), 'src', 'modules');
  const violations = findCrossModuleInfrastructureViolations(sourceRoot);

  if (violations.length > 0) {
    console.error('Cross-module infrastructure boundary violations found:\n');
    for (const violation of violations) {
      console.error(
        `  ${violation.file}:${violation.line}: imports ${violation.importPath}`,
      );
    }
    process.exit(1);
  }

  console.log('Cross-module infrastructure boundary check passed.');
}
