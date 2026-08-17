import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { TenantContextService } from '../../common/tenancy/tenant-context';
import { hashPassword } from '../../modules/auth/application/password-hasher';
import { SignupUseCase } from '../../modules/auth/application/signup.usecase';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from '../../modules/customers/application/customer-repository.port';
import { Role } from '../../modules/organizations/domain/membership';
import { AllocatePaymentUseCase } from '../../modules/payments/application/allocate-payment.usecase';
import {
  type IPaymentRepository,
  PAYMENT_REPOSITORY,
} from '../../modules/payments/application/payment-repository.port';
import { Payment } from '../../modules/payments/domain/payment';
import { BalanceHistoryActorType } from '../../modules/receivable-balance-history/domain/balance-history-actor-type';
import { CreateReceivableUseCase } from '../../modules/receivables/application/create-receivable.usecase';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../modules/users/application/user-repository.port';
import { User } from '../../modules/users/domain/user';
import {
  buildSeedCustomers,
  buildSeedOperatorUserProps,
  buildSeedReceivablePlans,
  SEED_OPERATOR_EMAIL,
  SEED_OPERATOR_PASSWORD,
} from './seed-dataset';
import { assertNotProduction } from './seed-guard';

export const SEED_OWNER_EMAIL = 'owner@seed.local';
export const SEED_OWNER_PASSWORD = 'SeedPass123!';
const SEED_ORGANIZATION_NAME = 'Casso Seed Co';

async function seedOperator(userRepo: IUserRepository): Promise<void> {
  const existingOperator = await userRepo.findByEmail(SEED_OPERATOR_EMAIL);
  if (existingOperator) {
    console.log(
      `Already seeded (operator ${SEED_OPERATOR_EMAIL} exists) — skipping.`,
    );
    return;
  }

  const passwordHash = await hashPassword(SEED_OPERATOR_PASSWORD);
  const operator = new User(
    buildSeedOperatorUserProps(randomUUID(), passwordHash, new Date()),
  );
  await userRepo.save(operator);
  console.log(
    `Seeded operator — login with ${SEED_OPERATOR_EMAIL} / ${SEED_OPERATOR_PASSWORD}`,
  );
}

async function main() {
  assertNotProduction(process.env.NODE_ENV);

  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const userRepo = app.get<IUserRepository>(USER_REPOSITORY);
    await seedOperator(userRepo);

    const existing = await userRepo.findByEmail(SEED_OWNER_EMAIL);
    if (existing) {
      console.log(
        `Already seeded (owner ${SEED_OWNER_EMAIL} exists) — skipping.`,
      );
      return;
    }

    const signup = app.get(SignupUseCase);
    const { user, organization } = await signup.execute({
      organizationName: SEED_ORGANIZATION_NAME,
      name: 'Seed Owner',
      email: SEED_OWNER_EMAIL,
      password: SEED_OWNER_PASSWORD,
    });
    await userRepo.save(user.markEmailVerified());

    const tenantContext = app.get(TenantContextService);
    const customerRepo = app.get<ICustomerRepository>(CUSTOMER_REPOSITORY);
    const paymentRepo = app.get<IPaymentRepository>(PAYMENT_REPOSITORY);
    const createReceivable = app.get(CreateReceivableUseCase);
    const allocatePayment = app.get(AllocatePaymentUseCase);

    await tenantContext.run(
      { userId: user.id, organizationId: organization.id, role: Role.OWNER },
      async () => {
        const customerPlans = buildSeedCustomers();
        const customerIds: string[] = [];
        for (const plan of customerPlans) {
          const customerId = randomUUID();
          await customerRepo.save({
            id: customerId,
            organizationId: organization.id,
            createdAt: new Date(),
            ...plan,
          });
          customerIds.push(customerId);
        }

        const receivablePlans = buildSeedReceivablePlans(
          new Date(),
          customerIds.length,
        );
        for (const plan of receivablePlans) {
          const receivable = await createReceivable.execute({
            customerId: customerIds[plan.customerIndex],
            invoiceId: null,
            originalAmount: plan.originalAmount,
            dueDate: plan.dueDate,
            salesRepresentativeId: null,
          });

          if (plan.paymentAmount > 0) {
            const payment = new Payment({
              id: randomUUID(),
              organizationId: organization.id,
              customerId: customerIds[plan.customerIndex],
              bankTransactionId: null,
              totalAmount: plan.paymentAmount,
              allocatedAmount: 0,
              payerName: customerPlans[plan.customerIndex].name,
              receivedAt: new Date(),
              createdAt: new Date(),
            });
            await paymentRepo.save(payment);
            await allocatePayment.execute({
              paymentId: payment.id,
              receivableId: receivable.id,
              amount: plan.paymentAmount,
              allocatedByUserId: user.id,
              provenance: {
                actorType: BalanceHistoryActorType.SYSTEM,
                actorUserId: null,
              },
            });
          }
        }
      },
    );

    console.log(
      `Seeded organization "${SEED_ORGANIZATION_NAME}" — login with ${SEED_OWNER_EMAIL} / ${SEED_OWNER_PASSWORD}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error('Seed script failed:', error);
  process.exit(1);
});
