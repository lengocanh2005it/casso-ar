import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCopilotTables20260809020000 implements MigrationInterface {
  name = 'AddCopilotTables20260809020000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "copilotChatMonthlyLimit" integer NOT NULL DEFAULT 50',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "copilot_conversations" (
        "id" uuid NOT NULL,
        "organizationId" character varying NOT NULL,
        "userId" character varying NOT NULL,
        "customerId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_copilot_conversations" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_copilot_conversations_organization_user" ON "copilot_conversations" ("organizationId", "userId")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "copilot_messages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organizationId" character varying NOT NULL,
        "conversationId" character varying NOT NULL,
        "role" character varying NOT NULL,
        "content" text NOT NULL,
        "toolCalls" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_copilot_messages" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_copilot_messages_conversation_created" ON "copilot_messages" ("conversationId", "createdAt")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_copilot_messages_organization_role_created" ON "copilot_messages" ("organizationId", "role", "createdAt")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "copilot_pending_actions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organizationId" character varying NOT NULL,
        "conversationId" character varying NOT NULL,
        "actionType" character varying NOT NULL,
        "payload" jsonb NOT NULL,
        "status" character varying NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "resolvedAt" TIMESTAMP WITH TIME ZONE,
        "resolvedByUserId" uuid,
        CONSTRAINT "PK_copilot_pending_actions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_copilot_pending_actions_organization_status_created" ON "copilot_pending_actions" ("organizationId", "status", "createdAt")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "copilot_drafts" (
        "id" uuid NOT NULL,
        "organizationId" character varying NOT NULL,
        "receivableId" character varying NOT NULL,
        "recipientEmail" character varying NOT NULL,
        "subject" character varying NOT NULL,
        "bodyHtml" text NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_copilot_drafts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_copilot_drafts_organization_receivable" ON "copilot_drafts" ("organizationId", "receivableId")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_usage_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organizationId" character varying NOT NULL,
        "conversationId" character varying NOT NULL,
        "model" character varying NOT NULL,
        "promptVersion" character varying NOT NULL,
        "inputTokens" integer,
        "outputTokens" integer,
        "latencyMs" integer NOT NULL,
        "toolCallsCount" integer NOT NULL,
        "isError" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_ai_usage_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_ai_usage_logs_organization_created" ON "ai_usage_logs" ("organizationId", "createdAt")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_ai_usage_logs_organization_created"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "ai_usage_logs"');

    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_copilot_drafts_organization_receivable"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "copilot_drafts"');

    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_copilot_pending_actions_organization_status_created"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "copilot_pending_actions"');

    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_copilot_messages_organization_role_created"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_copilot_messages_conversation_created"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "copilot_messages"');

    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_copilot_conversations_organization_user"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "copilot_conversations"');

    await queryRunner.query(
      'ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "copilotChatMonthlyLimit"',
    );
  }
}
