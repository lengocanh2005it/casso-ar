import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function collectProductionTsFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const file = join(dir, entry);
    if (statSync(file).isDirectory()) return collectProductionTsFiles(file);
    return file.endsWith('.ts') && !file.endsWith('.spec.ts') ? [file] : [];
  });
}

export function findCrossModuleInfrastructureViolations(sourceRoot) {
  return collectProductionTsFiles(sourceRoot).flatMap((file) => {
    const sourceModule = relative(sourceRoot, file).split(sep)[0];
    const content = readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
    );
    const violations = [];

    for (const statement of sourceFile.statements) {
      if (
        !(
          ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
        ) ||
        !statement.moduleSpecifier ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      )
        continue;

      const importPath = statement.moduleSpecifier.text;
      const target = importPath.startsWith('.')
        ? resolve(file, '..', importPath)
        : resolve(sourceRoot, '..', importPath);
      const targetParts = relative(sourceRoot, target).split(sep);
      if (
        targetParts[0] !== sourceModule &&
        targetParts[1] === 'infrastructure'
      ) {
        violations.push({
          file,
          line:
            sourceFile.getLineAndCharacterOfPosition(
              statement.getStart(sourceFile),
            ).line + 1,
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
