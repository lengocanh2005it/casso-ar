import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { PlanPaymentHistoryOrmEntity } from '../../modules/payos/infrastructure/plan-payment-history.orm-entity';
import { assertLocalDatabaseHost, assertNotProduction } from './seed-guard';
import { buildSeedPlanPaymentHistoryPlans } from './seed-plan-payment-history-dataset';

const SEED_OWNER_EMAIL = 'admin@antam.test';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
})
class SeedConfigModule {}

async function seedPlanPaymentHistory(): Promise<void> {
  const configApp = await NestFactory.createApplicationContext(
    SeedConfigModule,
    { logger: false },
  );
  try {
    const config = configApp.get(ConfigService);
    assertNotProduction(config.get<string>('NODE_ENV'));
    assertLocalDatabaseHost(config.get<string>('DB_HOST', 'localhost'));

    const dataSource = new DataSource({
      type: 'postgres',
      host: config.get<string>('DB_HOST', 'localhost'),
      port: Number(config.get<string>('DB_PORT', '5432')),
      username: config.get<string>('DB_USERNAME', 'casso'),
      password: config.getOrThrow<string>('DB_PASSWORD'),
      database: config.get<string>('DB_DATABASE', 'casso_ar'),
      entities: [PlanPaymentHistoryOrmEntity],
      synchronize: false,
    });
    await dataSource.initialize();
    try {
      const plans = buildSeedPlanPaymentHistoryPlans(new Date());
      await dataSource.transaction(async (manager) => {
        const ownerRows: unknown[] = await manager.query(
          'SELECT membership."organizationId" AS "organizationId" ' +
            'FROM "users" AS appUser ' +
            'INNER JOIN "memberships" AS membership ' +
            'ON membership."userId" = appUser."id"::text ' +
            'WHERE appUser."email" = $1 ' +
            'AND membership."role" = \'OWNER\' ' +
            'AND membership."status" = \'ACTIVE\' ' +
            'AND membership."joinedAt" IS NOT NULL ' +
            'ORDER BY membership."createdAt" ASC ' +
            'LIMIT 1',
          [SEED_OWNER_EMAIL],
        );
        const owner = ownerRows[0];
        const organizationId =
          typeof owner === 'object' &&
          owner !== null &&
          'organizationId' in owner &&
          typeof owner.organizationId === 'string'
            ? owner.organizationId
            : undefined;
        if (!organizationId) {
          throw new Error(
            'Seed OWNER ' +
              SEED_OWNER_EMAIL +
              ' was not found; run the demo seed first.',
          );
        }

        const rows = plans.map((plan, index) => ({
          organizationId,
          sourceType: plan.sourceType,
          sourceId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          orderCode: plan.orderCode,
          planId: plan.planId,
          periodStart: plan.periodStart,
          periodEnd: plan.periodEnd,
          receivedAmount: plan.receivedAmount,
          quotedAmount: plan.quotedAmount,
          payosPaymentLinkId: null,
          providerReference: null,
          providerTransactionTime: null,
          transferIdentity: null,
          deliveryFingerprint:
            plan.provenance === 'PAYOS_WEBHOOK'
              ? `local-ui-audit:${plan.orderCode}`
              : null,
          initialOutcome: plan.initialOutcome,
          provenance: plan.provenance,
          confirmedAt: plan.confirmedAt,
          createdAt: plan.confirmedAt,
        }));

        await manager
          .getRepository(PlanPaymentHistoryOrmEntity)
          .createQueryBuilder()
          .insert()
          .values(rows)
          .orIgnore()
          .execute();
      });

      process.stdout.write(
        'Ensured ' +
          plans.length +
          ' local plan payment-history rows for ' +
          SEED_OWNER_EMAIL +
          '.\n',
      );
    } finally {
      await dataSource.destroy();
    }
  } finally {
    await configApp.close();
  }
}

seedPlanPaymentHistory().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
