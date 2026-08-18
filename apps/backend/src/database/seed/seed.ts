import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PlanId } from '@casso-ledger/shared-types';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../../app.module';
import { TenantContextService } from '../../common/tenancy/tenant-context';
import { hashPassword } from '../../modules/auth/application/password-hasher';
import { SignupUseCase } from '../../modules/auth/application/signup.usecase';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../../modules/billing/application/subscription-repository.port';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from '../../modules/customers/application/customer-repository.port';
import {
  DISPUTE_REPOSITORY,
  type IDisputeRepository,
} from '../../modules/disputes/application/dispute-repository.port';
import { Dispute, DisputeStatus } from '../../modules/disputes/domain/dispute';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  type IEmailTemplateRepository,
} from '../../modules/email-templates/application/email-template-repository.port';
import { EmailTemplate } from '../../modules/email-templates/domain/email-template';
import {
  type IInvoiceRepository,
  INVOICE_REPOSITORY,
} from '../../modules/invoices/application/invoice-repository.port';
import { Invoice } from '../../modules/invoices/domain/invoice';
import { Role } from '../../modules/organizations/domain/membership';
import { AllocatePaymentUseCase } from '../../modules/payments/application/allocate-payment.usecase';
import {
  type IPaymentRepository,
  PAYMENT_REPOSITORY,
} from '../../modules/payments/application/payment-repository.port';
import { Payment } from '../../modules/payments/domain/payment';
import { BalanceHistoryActorType } from '../../modules/receivable-balance-history/domain/balance-history-actor-type';
import { CreateReceivableUseCase } from '../../modules/receivables/application/create-receivable.usecase';
import type { IReminderPolicyRepository } from '../../modules/reminders/application/reminder-policy-repository.port';
import type { IReminderRuleRepository } from '../../modules/reminders/application/reminder-rule-repository.port';
import { ReminderPolicy } from '../../modules/reminders/domain/reminder-policy';
import { ReminderRule } from '../../modules/reminders/domain/reminder-rule';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../modules/users/application/user-repository.port';
import { User } from '../../modules/users/domain/user';
import {
  BANK_TRANSACTION_REPOSITORY,
  type IBankTransactionRepository,
} from '../../modules/webhooks/application/bank-transaction-repository.port';
import {
  type IWebhookInboxRepository,
  WEBHOOK_INBOX_REPOSITORY,
} from '../../modules/webhooks/application/webhook-inbox-repository.port';
import { BankTransaction } from '../../modules/webhooks/domain/bank-transaction';
import { WebhookInbox } from '../../modules/webhooks/domain/webhook-inbox';
import {
  buildSeedBankTransactionPlans,
  buildSeedCustomers,
  buildSeedDisputedReceivablePlans,
  buildSeedEmailTemplatePlans,
  buildSeedInvoicePlans,
  buildSeedOperatorUserProps,
  buildSeedReceivablePlans,
  buildSeedReminderPolicyPlans,
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
    const subscriptionRepo = app.get<ISubscriptionRepository>(
      SUBSCRIPTION_REPOSITORY,
    );
    const createReceivable = app.get(CreateReceivableUseCase);
    const allocatePayment = app.get(AllocatePaymentUseCase);
    const dataSource = app.get(DataSource);
    const invoiceRepo = app.get<IInvoiceRepository>(INVOICE_REPOSITORY);
    const bankTransactionRepo = app.get<IBankTransactionRepository>(
      BANK_TRANSACTION_REPOSITORY,
    );
    const webhookInboxRepo = app.get<IWebhookInboxRepository>(
      WEBHOOK_INBOX_REPOSITORY,
    );
    const emailTemplateRepo = app.get<IEmailTemplateRepository>(
      EMAIL_TEMPLATE_REPOSITORY,
    );
    const reminderPolicyRepo = app.get<IReminderPolicyRepository>(
      'IReminderPolicyRepository',
    );
    const reminderRuleRepo = app.get<IReminderRuleRepository>(
      'IReminderRuleRepository',
    );
    const disputeRepo = app.get<IDisputeRepository>(DISPUTE_REPOSITORY);

    await tenantContext.run(
      { userId: user.id, organizationId: organization.id, role: Role.OWNER },
      async () => {
        // Upgrade to ENTERPRISE plan so seed data is not limited
        const subscription = await subscriptionRepo.findByOrganizationId(
          organization.id,
        );
        if (subscription) {
          await subscriptionRepo.save(
            subscription.changeToPlan(PlanId.ENTERPRISE),
            undefined,
            organization.id,
          );
        }

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
              receivedAt: plan.dueDate,
              createdAt: plan.dueDate,
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

        // ── Disputed receivables ───────────────────────────────────
        const disputedPlans = buildSeedDisputedReceivablePlans(
          new Date(),
          customerIds.length,
        );
        const disputedReceivableIds: string[] = [];
        for (const plan of disputedPlans) {
          const receivable = await createReceivable.execute({
            customerId: customerIds[plan.customerIndex],
            invoiceId: null,
            originalAmount: plan.originalAmount,
            dueDate: plan.dueDate,
            salesRepresentativeId: null,
          });
          disputedReceivableIds.push(receivable.id);
        }
        for (const receivableId of disputedReceivableIds) {
          const dispute = new Dispute({
            id: randomUUID(),
            organizationId: organization.id,
            receivableId,
            reason: 'Khách hàng phản đối số tiền hoặc điều kiện thanh toán',
            status: DisputeStatus.OPEN,
            openedByUserId: user.id,
            resolvedByUserId: null,
            resolvedAt: null,
            createdAt: new Date(),
            version: 1,
          });
          await disputeRepo.save(dispute);
        }

        // ── Invoices ───────────────────────────────────────────────
        const invoicePlans = buildSeedInvoicePlans(
          new Date(),
          disputedReceivableIds.length + receivablePlans.length,
          customerIds.length,
        );
        for (const plan of invoicePlans) {
          const invoice = new Invoice({
            id: randomUUID(),
            organizationId: organization.id,
            customerId: customerIds[plan.customerIndex],
            invoiceNumber: plan.invoiceNumber,
            issueDate: plan.issueDate,
            totalAmount: plan.totalAmount,
            taxAmount: plan.taxAmount,
            sourceType: plan.sourceType,
            fileUrl: null,
            status: plan.status,
            createdAt: plan.issueDate,
          });
          await invoiceRepo.save(invoice);
        }

        // ── Bank transactions ──────────────────────────────────────
        const bankTransactionPlans = buildSeedBankTransactionPlans(new Date());
        // Create a fake bank connection and webhook inbox entries
        const fakeBankConnectionId = randomUUID();
        for (const plan of bankTransactionPlans) {
          const inboxId = randomUUID();
          const inbox = new WebhookInbox({
            id: inboxId,
            organizationId: organization.id,
            bankConnectionId: fakeBankConnectionId,
            providerTransactionId: `provider-${randomUUID().slice(0, 8)}`,
            rawPayload: {
              amount: plan.amount,
              counterparty: plan.counterpartyName,
            },
            receivedAt: plan.transactionDateTime,
            status: 'PROCESSED',
            processedAt: plan.transactionDateTime,
            errorMessage: null,
            retryCount: 0,
          });
          await webhookInboxRepo.save(inbox);

          const tx = new BankTransaction({
            id: randomUUID(),
            organizationId: organization.id,
            bankConnectionId: fakeBankConnectionId,
            webhookInboxId: inboxId,
            providerTransactionId: inbox.providerTransactionId,
            amount: plan.amount,
            transactionDateTime: plan.transactionDateTime,
            counterpartyAccountNumber: plan.counterpartyAccountNumber,
            counterpartyName: plan.counterpartyName,
            transferContent: plan.transferContent,
            status: plan.status,
            version: 1,
            createdAt: plan.transactionDateTime,
          });
          await bankTransactionRepo.save(tx);
        }

        // ── Email templates ────────────────────────────────────────
        const emailTemplatePlans = buildSeedEmailTemplatePlans();
        const emailTemplateIds: string[] = [];
        for (const plan of emailTemplatePlans) {
          const templateId = randomUUID();
          const template = new EmailTemplate({
            id: templateId,
            organizationId: organization.id,
            name: plan.name,
            subject: plan.subject,
            bodyHtml: plan.bodyHtml,
            reminderStage: plan.reminderStage,
            isDefault: plan.isDefault,
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 1,
          });
          await emailTemplateRepo.save(template);
          emailTemplateIds.push(templateId);
        }

        // ── Reminder policies & rules ──────────────────────────────
        const policyPlans = buildSeedReminderPolicyPlans();
        const existingPolicies = await reminderPolicyRepo.findAll();
        const existingGroups = new Set(
          existingPolicies.map((p) => p.customerGroup),
        );

        for (const policyPlan of policyPlans) {
          if (existingGroups.has(policyPlan.customerGroup)) continue;

          const policyId = randomUUID();
          const policy = new ReminderPolicy({
            id: policyId,
            organizationId: organization.id,
            customerGroup: policyPlan.customerGroup,
            isActive: policyPlan.isActive,
            escalationThresholdDays: policyPlan.escalationThresholdDays,
            createdAt: new Date(),
          });
          await reminderPolicyRepo.save(policy);

          const rules = policyPlan.rules.map(
            (rulePlan) =>
              new ReminderRule({
                id: randomUUID(),
                reminderPolicyId: policyId,
                offsetDays: rulePlan.offsetDays,
                emailTemplateId: emailTemplateIds[rulePlan.emailTemplateIndex],
                minIntervalDays: rulePlan.minIntervalDays,
                createdAt: new Date(),
              }),
          );
          await dataSource.transaction((manager) =>
            reminderRuleRepo.replaceForPolicy(policyId, rules, manager),
          );
        }
      },
    );

    // ── Backfill balance history coverage for trend charts ─────
    const SIX_MONTHS_AGO = new Date();
    SIX_MONTHS_AGO.setMonth(SIX_MONTHS_AGO.getMonth() - 6);

    await dataSource.query(
      `INSERT INTO "receivable_balance_history_coverage"
       ("organizationId", "coveredFrom", "reason")
       VALUES ($1, $2, 'SEED_BACKFILL')
       ON CONFLICT ("organizationId") DO UPDATE
       SET "coveredFrom" = $2`,
      [organization.id, SIX_MONTHS_AGO],
    );

    // Insert monthly outstanding snapshots for each past month
    const now = new Date();
    for (let m = 5; m >= 1; m--) {
      const monthEnd = new Date(now);
      monthEnd.setMonth(monthEnd.getMonth() - m);
      monthEnd.setDate(0); // last day of previous month
      monthEnd.setHours(23, 59, 59, 999);

      // Sum outstanding for receivables that existed at month-end
      const outstandingRows = await dataSource.query(
        `SELECT COALESCE(SUM(r."originalAmount" - r."paidAmount"), 0) AS outstanding
         FROM "receivables" r
         WHERE r."organizationId" = $1
           AND r."dueDate" <= $2
           AND r."status" NOT IN ('PAID', 'CANCELLED', 'WRITTEN_OFF')`,
        [organization.id, monthEnd],
      );

      const outstanding = Number(outstandingRows[0]?.outstanding ?? 0);
      if (outstanding <= 0) continue;

      // Create a snapshot for each receivable that existed at month-end
      const receivableRows = await dataSource.query(
        `SELECT r."id", r."status"::text AS status, r."originalAmount" - r."paidAmount" AS remaining
         FROM "receivables" r
         WHERE r."organizationId" = $1
           AND r."dueDate" <= $2
           AND r."status" NOT IN ('PAID', 'CANCELLED', 'WRITTEN_OFF')`,
        [organization.id, monthEnd],
      );

      for (const row of receivableRows) {
        await dataSource.query(
          `INSERT INTO "receivable_balance_history"
           ("id", "organizationId", "receivableId", "status", "remainingAmount",
            "effectiveAt", "changeSource", "changeReason", "createdAt")
           VALUES ($1, $2, $3, $4::receivable_balance_history_status_enum, $5, $6,
                   'SEED_BACKFILL', 'Trend chart seed data', $6)
           ON CONFLICT DO NOTHING`,
          [
            randomUUID(),
            organization.id,
            row.id,
            row.status,
            row.remaining,
            monthEnd,
          ],
        );
      }
    }

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
