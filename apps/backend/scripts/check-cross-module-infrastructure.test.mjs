import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { findCrossModuleInfrastructureViolations } from './check-cross-module-infrastructure.mjs';

function createFixture(files) {
  const sourceRoot = mkdtempSync(join(tmpdir(), 'cross-module-infrastructure-'));
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(sourceRoot, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
  return sourceRoot;
}

test('reports only cross-module production infrastructure imports', (t) => {
  const sourceRoot = createFixture({
    'customers/customers.module.ts': "import './infrastructure/typeorm-customer.repository';\n",
    'payments/application/create-payment.usecase.ts':
      "import '../../customers/infrastructure/typeorm-customer.repository';\n",
    'payments/application/create-payment.usecase.spec.ts':
      "import '../../customers/infrastructure/typeorm-customer.repository';\n",
  });
  t.after(() => rmSync(sourceRoot, { recursive: true, force: true }));

  assert.deepEqual(findCrossModuleInfrastructureViolations(sourceRoot), [
    {
      file: join(sourceRoot, 'payments/application/create-payment.usecase.ts'),
      line: 1,
      importPath: '../../customers/infrastructure/typeorm-customer.repository',
    },
  ]);
});
