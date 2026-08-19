import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { assertValidLedgerEventAmount } from '../domain/ledger-event';
import type { LedgerEventKind } from '../domain/ledger-event-kind';
import type { LedgerEventSubjectType } from '../domain/ledger-event-subject-type';
import {
  type ILedgerEventRepository,
  LEDGER_EVENT_REPOSITORY,
} from './ledger-event-repository.port';

export interface RecordLedgerEventInput {
  organizationId: string;
  subjectType: LedgerEventSubjectType;
  subjectId: string;
  kind: LedgerEventKind;
  amount: number;
  effectiveAt?: Date;
  transitionReferenceId?: string;
  manager?: EntityManager;
}

@Injectable()
export class LedgerEventRecorderService {
  constructor(
    @Inject(LEDGER_EVENT_REPOSITORY)
    private readonly repo: ILedgerEventRepository,
  ) {}

  async record(input: RecordLedgerEventInput): Promise<void> {
    assertValidLedgerEventAmount(input.amount);
    const now = new Date();
    await this.repo.append(
      {
        id: randomUUID(),
        organizationId: input.organizationId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        kind: input.kind,
        amount: input.amount,
        effectiveAt: input.effectiveAt ?? now,
        transitionReferenceId: input.transitionReferenceId ?? null,
        createdAt: now,
      },
      input.manager,
    );
  }
}
