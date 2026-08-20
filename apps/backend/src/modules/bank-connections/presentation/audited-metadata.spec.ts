import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AUDITED_METADATA_KEY } from '../../../common/audit/audited.decorator';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RemindersController } from '../../reminders/presentation/reminders.controller';
import { BankConnectionsController } from './bank-connections.controller';

interface ControllerClass {
  name: string;
  prototype: Record<string, unknown>;
}

function guardsOf(target: object): unknown[] {
  return (Reflect.getMetadata(GUARDS_METADATA, target) ?? []) as unknown[];
}
function hasPermissionGuardAnywhere(controllerClass: ControllerClass): boolean {
  if (guardsOf(controllerClass).includes(PermissionGuard)) return true;
  return Object.getOwnPropertyNames(controllerClass.prototype).some((name) => {
    if (name === 'constructor') return false;
    const handler = controllerClass.prototype[name];
    return (
      typeof handler === 'function' &&
      guardsOf(handler).includes(PermissionGuard)
    );
  });
}

describe('audited metadata on write handlers (issue #104)', () => {
  it('audits reminder-policy update as REMINDER_POLICY_UPDATE', () => {
    const metadata = Reflect.getMetadata(
      AUDITED_METADATA_KEY,
      RemindersController.prototype.update,
    );
    expect(metadata).toEqual({
      actionType: 'REMINDER_POLICY_UPDATE',
      entityType: 'ReminderPolicy',
    });
  });

  it('audits bank-connection connect as BANK_CONNECTION_CREATE', () => {
    const metadata = Reflect.getMetadata(
      AUDITED_METADATA_KEY,
      BankConnectionsController.prototype.connect,
    );
    expect(metadata).toEqual({
      actionType: 'BANK_CONNECTION_CREATE',
      entityType: 'BankConnection',
    });
  });
});

describe('permission-guard sweep (issue #109)', () => {
  it('every controller using @RequirePermission also applies PermissionGuard (class or route level)', () => {
    const modulesDir = join(process.cwd(), 'src', 'modules');
    const missing: string[] = [];

    for (const moduleDir of readdirSync(modulesDir, {
      withFileTypes: true,
    })) {
      if (!moduleDir.isDirectory()) continue;
      const presentationDir = join(modulesDir, moduleDir.name, 'presentation');
      if (!existsSync(presentationDir)) continue;
      if (
        !readdirSync(presentationDir).some((f) => f.endsWith('.controller.ts'))
      )
        continue;
      for (const file of readdirSync(presentationDir).filter((f) =>
        f.endsWith('.controller.ts'),
      )) {
        const content = readFileSync(join(presentationDir, file), 'utf8');
        if (!content.includes('RequirePermission')) continue;
        // biome-ignore lint/security/noGlobalEval: test-only dynamic module load of controller classes
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const controllerModule = require(join(presentationDir, file));
        for (const exported of Object.values(controllerModule) as unknown[]) {
          if (
            typeof exported === 'function' &&
            typeof exported.prototype === 'object' &&
            exported.prototype !== null &&
            content.includes(`export class ${exported.name}`)
          ) {
            if (!hasPermissionGuardAnywhere(exported as ControllerClass)) {
              missing.push(`${moduleDir.name}/${file} (${exported.name})`);
            }
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('reminders controllers carry PermissionGuard (regression for #109)', () => {
    expect(guardsOf(RemindersController)).toContain(PermissionGuard);
  });
});
