import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import { AllocatePaymentUseCase } from '../../payments/application/allocate-payment.usecase';
import type { IPaymentRepository } from '../../payments/application/payment-repository.port';
import { PAYMENT_REPOSITORY } from '../../payments/application/payment-repository.port';
import { Payment } from '../../payments/domain/payment';
import { BankTransaction } from '../domain/bank-transaction';
import type { IBankTransactionRepository } from './bank-transaction-repository.port';
import { BANK_TRANSACTION_REPOSITORY } from './bank-transaction-repository.port';
import type { IMatchingCandidateRepository } from './matching-candidate-repository.port';
import { MATCHING_CANDIDATE_REPOSITORY } from './matching-candidate-repository.port';
import { MatchingEngineService } from './matching-engine.service';
import { normalizeBalanceHookPayload } from './transaction-normalizer';
import type { IWebhookInboxRepository } from './webhook-inbox-repository.port';
import { WEBHOOK_INBOX_REPOSITORY } from './webhook-inbox-repository.port';

const AUTO_MATCH_THRESHOLD = 90;
const EXCEPTION_QUEUE_THRESHOLD = 60;

@Injectable()
export class ProcessWebhookUseCase {
  constructor(
    @Inject(WEBHOOK_INBOX_REPOSITORY)
    private readonly inboxRepo: IWebhookInboxRepository,
    @Inject(BANK_TRANSACTION_REPOSITORY)
    private readonly transactionRepo: IBankTransactionRepository,
    private readonly matchingEngine: MatchingEngineService,
    @Inject(MATCHING_CANDIDATE_REPOSITORY)
    private readonly candidateRepo: IMatchingCandidateRepository,
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepo: IPaymentRepository,
    private readonly allocatePayment: AllocatePaymentUseCase,
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(webhookInboxId: string, organizationId: string): Promise<void> {
    const inbox = await this.inboxRepo.findById(webhookInboxId, organizationId);
    if (!inbox) throw new Error(`WebhookInbox ${webhookInboxId} not found`);
    try {
      await this.tenantContext.run(
        {
          userId: 'system',
          organizationId: inbox.organizationId,
          role: Role.OWNER,
        },
        async () => {
          const normalized = normalizeBalanceHookPayload(inbox.rawPayload);
          if (normalized.amount < 0) {
            await this.dataSource.transaction((manager) =>
              this.inboxRepo.save(inbox.markProcessed(), manager),
            );
            return;
          }
          const transaction = new BankTransaction({
            id: randomUUID(),
            organizationId: inbox.organizationId,
            bankConnectionId: inbox.bankConnectionId,
            webhookInboxId: inbox.id,
            providerTransactionId: normalized.providerTransactionId,
            amount: normalized.amount,
            transactionDateTime: normalized.transactionDateTime,
            counterpartyAccountNumber: normalized.counterpartyAccountNumber,
            counterpartyName: normalized.counterpartyName,
            transferContent: normalized.transferContent,
            status: 'UNMATCHED',
            version: 1,
            createdAt: new Date(),
          });
          const candidates = await this.matchingEngine.scoreCandidates(
            normalized,
            inbox.organizationId,
          );
          const top = candidates[0];
          await this.dataSource.transaction(async (manager) => {
            if (top && top.totalScore >= AUTO_MATCH_THRESHOLD) {
              const payment = new Payment({
                id: randomUUID(),
                organizationId: inbox.organizationId,
                customerId: top.customerId,
                bankTransactionId: transaction.id,
                totalAmount: transaction.amount,
                allocatedAmount: 0,
                payerName: transaction.counterpartyName,
                receivedAt: transaction.transactionDateTime,
                createdAt: new Date(),
              });
              await this.paymentRepo.save(payment, manager);
              await this.transactionRepo.save(transaction, manager);
              await this.allocatePayment.allocateWithinTransaction(manager, {
                paymentId: payment.id,
                receivableId: top.receivableId,
                amount: transaction.amount,
                allocatedByUserId: null,
              });
              await this.transactionRepo.save(
                transaction.markMatched(),
                manager,
              );
            } else if (top && top.totalScore >= EXCEPTION_QUEUE_THRESHOLD) {
              await this.transactionRepo.save(
                transaction.markPendingReview(),
                manager,
              );
              await this.candidateRepo.saveMany(
                this.matchingEngine.toMatchingCandidateEntities(
                  inbox.organizationId,
                  transaction.id,
                  candidates,
                ),
                manager,
              );
            } else {
              await this.transactionRepo.save(
                transaction.markUnmatched(),
                manager,
              );
            }
            await this.inboxRepo.save(inbox.markProcessed(), manager);
          });
        },
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown webhook processing error';
      const safeMessage = message.replace(
        /(authorization|bearer|token|secret|password)\s*[:=]?\s*[^\s,;]+/gi,
        '$1=[redacted]',
      );
      await this.dataSource.transaction((manager) =>
        this.inboxRepo.save(inbox.markFailed(safeMessage), manager),
      );
      throw error;
    }
  }
}
