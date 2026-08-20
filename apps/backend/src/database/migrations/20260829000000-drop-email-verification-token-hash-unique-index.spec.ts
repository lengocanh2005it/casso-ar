import type { QueryRunner } from 'typeorm';
import { DropEmailVerificationTokenHashUniqueIndex20260829000000 } from './20260829000000-drop-email-verification-token-hash-unique-index';

describe('DropEmailVerificationTokenHashUniqueIndex20260829000000', () => {
  it('drops the unique index on up', async () => {
    const migration =
      new DropEmailVerificationTokenHashUniqueIndex20260829000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "IDX_90489f8f3368c45f461e90efbe"',
    );
  });

  it('recreates the unique index on down', async () => {
    const migration =
      new DropEmailVerificationTokenHashUniqueIndex20260829000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'CREATE UNIQUE INDEX "IDX_90489f8f3368c45f461e90efbe" ON "email_verification_tokens" ("tokenHash")',
    );
  });
});
