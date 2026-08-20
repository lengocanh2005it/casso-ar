import type { QueryRunner } from 'typeorm';
import { AddEmailVerificationTokenLookupIndex20260830000000 } from './20260830000000-add-email-verification-token-lookup-index';

describe('AddEmailVerificationTokenLookupIndex20260830000000', () => {
  it('creates the composite lookup index on up', async () => {
    const migration = new AddEmailVerificationTokenLookupIndex20260830000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'CREATE INDEX "IDX_email_verification_tokens_user_id_token_hash" ON "email_verification_tokens" ("userId", "tokenHash")',
    );
  });

  it('drops the composite lookup index on down', async () => {
    const migration = new AddEmailVerificationTokenLookupIndex20260830000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "IDX_email_verification_tokens_user_id_token_hash"',
    );
  });
});
