import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailTemplateAttachmentsTable20260821000000
  implements MigrationInterface
{
  name = 'AddEmailTemplateAttachmentsTable20260821000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_template_attachments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organizationId" character varying NOT NULL,
        "emailTemplateId" character varying NOT NULL,
        "filename" character varying NOT NULL,
        "storageKey" character varying NOT NULL,
        "mimeType" character varying NOT NULL,
        "sizeBytes" integer NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_email_template_attachments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_email_template_attachments_organization" ON "email_template_attachments" ("organizationId")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_email_template_attachments_template" ON "email_template_attachments" ("emailTemplateId")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_email_template_attachments_template"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_email_template_attachments_organization"',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "email_template_attachments"',
    );
  }
}
