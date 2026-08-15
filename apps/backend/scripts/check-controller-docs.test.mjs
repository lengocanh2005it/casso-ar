import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { findControllerDocsViolations } from './check-controller-docs.mjs';

function createFixture(files) {
  const sourceRoot = join(
    mkdtempSync(join(tmpdir(), 'controller-docs-')),
    'src',
  );
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(sourceRoot, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
  return sourceRoot;
}

test('flags controllers without @ApiTags', (t) => {
  const sourceRoot = createFixture({
    'modules/customers/presentation/customers.controller.ts':
      "import { Controller, Get } from '@nestjs/common';\n@Controller('customers')\nexport class CustomersController {}\n",
    'modules/receivables/presentation/receivables.controller.ts':
      "import { ApiTags } from '@nestjs/swagger';\nimport { Controller } from '@nestjs/common';\n@ApiTags('receivables')\n@Controller('receivables')\nexport class ReceivablesController {}\n",
  });
  t.after(() => rmSync(sourceRoot, { recursive: true, force: true }));

  assert.deepEqual(findControllerDocsViolations(sourceRoot), [
    join(sourceRoot, 'modules/customers/presentation/customers.controller.ts'),
  ]);
});

test('flags controllers whose @ApiTags is not directly above @Controller', (t) => {
  const sourceRoot = createFixture({
    'modules/customers/presentation/customers.controller.ts':
      "import { ApiTags } from '@nestjs/swagger';\nimport { Controller, Get } from '@nestjs/common';\n@Controller('customers')\nexport class CustomersController {\n  @Get()\n  @ApiTags('customers')\n  list() {}\n}\n",
  });
  t.after(() => rmSync(sourceRoot, { recursive: true, force: true }));

  assert.deepEqual(findControllerDocsViolations(sourceRoot), [
    join(sourceRoot, 'modules/customers/presentation/customers.controller.ts'),
  ]);
});

test('ignores spec files and non-controller files', (t) => {
  const sourceRoot = createFixture({
    'modules/customers/presentation/customers.controller.spec.ts':
      "import { Controller } from '@nestjs/common';\n",
    'modules/customers/presentation/customers.controller.ts':
      "import { ApiTags } from '@nestjs/swagger';\nimport { Controller } from '@nestjs/common';\n@ApiTags('customers')\n@Controller('customers')\nexport class CustomersController {}\n",
    'modules/customers/application/create-customer.usecase.ts':
      "import { Controller } from '@nestjs/common';\n",
  });
  t.after(() => rmSync(sourceRoot, { recursive: true, force: true }));

  assert.deepEqual(findControllerDocsViolations(sourceRoot), []);
});
