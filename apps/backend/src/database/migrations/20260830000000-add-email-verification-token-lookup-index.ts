import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailVerificationTokenLookupIndex20260830000000
  implements MigrationInterface
{
  name = 'AddEmailVerificationTokenLookupIndex20260830000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX "IDX_email_verification_tokens_user_id_token_hash" ON "email_verification_tokens" ("userId", "tokenHash")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_email_verification_tokens_user_id_token_hash"',
    );
  }
}
