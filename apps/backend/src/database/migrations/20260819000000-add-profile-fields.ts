import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProfileFields1700000000000 implements MigrationInterface {
  name = 'AddProfileFields1700000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500) NULL
    `);

    await queryRunner.query(`
      CREATE TABLE change_password_otps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        otp_hash VARCHAR(64) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_change_password_otps_user
        ON change_password_otps(user_id, used)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS change_password_otps`);
    await queryRunner.query(
      `ALTER TABLE users DROP COLUMN IF EXISTS avatar_url`,
    );
  }
}
