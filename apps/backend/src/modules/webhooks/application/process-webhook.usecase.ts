import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { JsonLogger } from '../../../common/observability/json-logger.service';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { LedgerEventRecorderService } from '../../ledger/application/ledger-event-recorder.service';
import { LedgerEventKind } from '../../ledger/domain/ledger-event-kind';
import { LedgerEventSubjectType } from '../../ledger/domain/ledger-event-subject-type';
import { Role } from '../../organizations/domain/membership';
import { AllocatePaymentUseCase } from '../../payments/application/allocate-payment.usecase';
import type { IPaymentRepository } from '../../payments/application/payment-repository.port';
import { PAYMENT_REPOSITORY } from '../../payments/application/payment-repository.port';
import { Payment } from '../../payments/domain/payment';
import { BalanceHistoryActorType } from '../../receivable-balance-history/domain/balance-history-actor-type';
import { BankTransaction } from '../domain/bank-transaction';
import type { IBankTransactionRepository } from './bank-transaction-repository.port';
import { BANK_TRANSACTION_REPOSITORY } from './bank-transaction-repository.port';
import { AUTO_MATCH_THRESHOLD, canAutoMatch } from './can-auto-match';
import { MatchingAiRecommendationService } from './matching-ai-recommendation.service';
import type { IMatchingCandidateRepository } from './matching-candidate-repository.port';
import { MATCHING_CANDIDATE_REPOSITORY } from './matching-candidate-repository.port';
import { MatchingEngineService } from './matching-engine.service';
import { normalizeBalanceHookPayload } from './transaction-normalizer';
import type { IWebhookInboxRepository } from './webhook-inbox-repository.port';
import { WEBHOOK_INBOX_REPOSITORY } from './webhook-inbox-repository.port';

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
    private readonly ledgerRecorder: LedgerEventRecorderService,
    private readonly matchingAiRecommendation: MatchingAiRecommendationService,
    @Optional() private readonly logger?: JsonLogger,
  ) {}

  async execute(webhookInboxId: string, organizationId: string): Promise<void> {
    const inbox = await this.inboxRepo.findById(webhookInboxId, organizationId);
    if (!inbox)
      throw new AppError(
        ErrorCode.NOT_FOUND,
        `WebhookInbox ${webhookInboxId} not found`,
      );
    // PROCESSED is terminal: BullMQ may redeliver after the business
    // transaction committed (e.g. a post-commit step threw) — replay is a no-op.
    if (inbox.status === 'PROCESSED') {
      // JsonLogger reads organizationId/userId from the tenant context, so log
      // under the same synthetic system user as the processing path below.
      await this.tenantContext.run(
        {
          userId: 'system',
          organizationId: inbox.organizationId,
          role: Role.OWNER,
        },
        async () => {
          this.logger?.log(
            {
              message: 'Webhook replay ignored: inbox already PROCESSED',
              webhookInboxId: inbox.id,
              organizationId: inbox.organizationId,
            },
            ProcessWebhookUseCase.name,
          );
        },
      );
      return;
    }
    try {
      await this.tenantContext.run(
        {
          userId: 'system',
          organizationId: inbox.organizationId,
          role: Role.OWNER,
        },
        async () => {
          const normalized = normalizeBalanceHookPayload(inbox.rawPayload);
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
          if (transaction.isRefund()) {
            await this.dataSource.transaction(async (manager) => {
              await this.transactionRepo.save(
                transaction.markIgnored(),
                manager,
              );
              await this.inboxRepo.save(inbox.markProcessed(), manager);
            });
            return;
          }
          const candidates = await this.matchingEngine.scoreCandidates(
            normalized,
            inbox.organizationId,
          );
          const top = candidates[0];
          const autoMatchable = canAutoMatch(candidates, transaction.amount);

          const aiRecommendation =
            top &&
            top.totalScore >= EXCEPTION_QUEUE_THRESHOLD &&
            top.totalScore < AUTO_MATCH_THRESHOLD
              ? await this.matchingAiRecommendation.evaluate({
                  organizationId: inbox.organizationId,
                  webhookInboxId: inbox.id,
                  transaction: normalized,
                  candidates,
                })
              : null;
          let autoMatchResult:
            | {
                paymentId: string;
                receivableId: string;
                customerId: string;
                becameClosed: boolean;
              }
            | undefined;
          const persistPendingReview = async (
            manager: EntityManager,
          ): Promise<void> => {
            if (!top) return;
            const pendingTransaction = aiRecommendation
              ? transaction.withAiRecommendation(aiRecommendation)
              : transaction;
            await this.transactionRepo.save(
              pendingTransaction.markPendingReview(),
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
          };
          try {
            await this.dataSource.transaction(async (manager) => {
              if (autoMatchable && top) {
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
                await this.ledgerRecorder.record({
                  organizationId: payment.organizationId,
                  subjectType: LedgerEventSubjectType.PAYMENT,
                  subjectId: payment.id,
                  kind: LedgerEventKind.PAYMENT_RECEIVED,
                  amount: payment.totalAmount,
                  manager,
                });
                await this.transactionRepo.save(transaction, manager);
                const allocationResult =
                  await this.allocatePayment.allocateWithinTransaction(
                    manager,
                    {
                      paymentId: payment.id,
                      receivableId: top.receivableId,
                      amount: transaction.amount,
                      allocatedByUserId: null,
                      provenance: {
                        actorType: BalanceHistoryActorType.WEBHOOK,
                        actorUserId: null,
                      },
                    },
                  );
                autoMatchResult = {
                  paymentId: payment.id,
                  receivableId: top.receivableId,
                  customerId: allocationResult.customerId,
                  becameClosed: allocationResult.becameClosed,
                };
                await this.transactionRepo.save(
                  transaction.markMatched(),
                  manager,
                );
              } else if (top && top.totalScore >= EXCEPTION_QUEUE_THRESHOLD) {
                await persistPendingReview(manager);
              } else {
                await this.transactionRepo.save(
                  transaction.markUnmatched(),
                  manager,
                );
              }
              await this.inboxRepo.save(inbox.markProcessed(), manager);
            });
          } catch (error) {
            const candidateNoLongerAllocatable =
              error instanceof AppError &&
              (error.errorCode === ErrorCode.ALLOCATION_EXCEEDS_REMAINING ||
                error.errorCode === ErrorCode.CONFLICT);
            if (!autoMatchable || !candidateNoLongerAllocatable) {
              throw error;
            }
            await this.dataSource.transaction(async (manager) => {
              await persistPendingReview(manager);
              await this.inboxRepo.save(inbox.markProcessed(), manager);
            });
          }
          if (autoMatchResult) {
            await this.allocatePayment.emitAllocationEvents({
              paymentId: autoMatchResult.paymentId,
              receivableId: autoMatchResult.receivableId,
              amount: transaction.amount,
              allocatedByUserId: null,
              organizationId: inbox.organizationId,
              customerId: autoMatchResult.customerId,
              becameClosed: autoMatchResult.becameClosed,
            });
          }
        },
      );
    } catch (error) {
      // recordFailure never overrides PROCESSED. A throw after commit (e.g.
      // emitAllocationEvents) therefore leaves the inbox PROCESSED and the
      // replay a no-op, so those events are not re-emitted — recovery is #421.
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown webhook processing error';
      const safeMessage = message
        .replace(
          /(authorization|bearer|token|secret|password)\s*[:=]?\s*[^\s,;]+/gi,
          '$1=[redacted]',
        )
        // ponytail: best-effort beyond labeled secrets — also strips
        // JWT-shaped (a.b.c) and long hex/base64 token-shaped strings with
        // no label. An opaque secret with neither a label nor a
        // recognizable shape still passes through; tighten if one leaks.
        .replace(
          /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
          '[redacted]',
        )
        .replace(/\b[A-Za-z0-9+/_-]{32,}={0,2}\b/g, '[redacted]');
      await this.dataSource.transaction((manager) =>
        this.inboxRepo.recordFailure(
          inbox.id,
          inbox.organizationId,
          safeMessage,
          manager,
        ),
      );
      throw error;
    }
  }
}
