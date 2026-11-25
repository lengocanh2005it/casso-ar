import { ErrorCode } from '../../../../common/errors/error-code';
import { TenantContextService } from '../../../../common/tenancy/tenant-context';
import { MAX_SEARCH_LENGTH } from '../../../../common/validation/search-length';
import type { UnmatchedBankTransactionPage } from '../../../exception-queue/application/unmatched-bank-transactions-query.service';
import { Role } from '../../../organizations/domain/membership';
import { BankTransaction } from '../../../webhooks/domain/bank-transaction';
import { MatchingCandidate } from '../../../webhooks/domain/matching-candidate';
import {
  GET_EXCEPTION_QUEUE_ITEMS_SCHEMA,
  GetExceptionQueueItemsTool,
} from './get-exception-queue-items.tool';

function buildTool(page: Partial<UnmatchedBankTransactionPage> = {}) {
  const queryService = {
    execute: jest.fn().mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 10,
      ...page,
    }),
  };
  const tenantContext = new TenantContextService();
  const tool = new GetExceptionQueueItemsTool(
    queryService as any,
    tenantContext,
  );
  return { tool, queryService, tenantContext };
}

function runInTenant<T>(
  tenantContext: TenantContextService,
  callback: () => Promise<T>,
): Promise<T> {
  return tenantContext.run(
    { userId: 'u-1', organizationId: 'org-1', role: Role.ACCOUNTANT },
    callback,
  );
}

function transaction(overrides: Record<string, unknown> = {}) {
  return new BankTransaction({
    id: 'bt-1',
    organizationId: 'org-1',
    bankConnectionId: 'conn-1',
    webhookInboxId: 'inbox-1',
    providerTransactionId: 'provider-1',
    amount: 12_500_000,
    transactionDateTime: new Date('2026-11-20T09:30:00.000Z'),
    counterpartyAccountNumber: '0123456789',
    counterpartyName: 'NGUYEN VAN A',
    transferContent: 'CK HD-1 thanh toan',
    status: 'PENDING_REVIEW',
    version: 1,
    createdAt: new Date('2026-11-20T09:31:00.000Z'),
    ...overrides,
  });
}

function candidate(overrides: Record<string, unknown> = {}) {
  return new MatchingCandidate({
    id: 'mc-1',
    organizationId: 'org-1',
    bankTransactionId: 'bt-1',
    receivableId: 'rec-1',
    customerId: 'cust-1',
    referenceCodeScore: 40,
    amountScore: 30,
    customerBankAccountScore: 10,
    payerNameScore: 10,
    timingScore: 5,
    totalScore: 95,
    createdAt: new Date('2026-11-20T09:32:00.000Z'),
    ...overrides,
  });
}

describe('GetExceptionQueueItemsTool', () => {
  it('declares the agreed input schema and bounds', () => {
    expect(GetExceptionQueueItemsTool.NAME).toBe('getExceptionQueueItems');
    expect(GET_EXCEPTION_QUEUE_ITEMS_SCHEMA.required).toEqual([]);
    expect(GET_EXCEPTION_QUEUE_ITEMS_SCHEMA.properties.page).toMatchObject({
      type: 'integer',
      minimum: 1,
    });
    expect(GET_EXCEPTION_QUEUE_ITEMS_SCHEMA.properties.limit).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: 10,
      default: 10,
    });
    expect(GET_EXCEPTION_QUEUE_ITEMS_SCHEMA.properties.search).toMatchObject({
      type: 'string',
      maxLength: MAX_SEARCH_LENGTH,
    });
    expect(GET_EXCEPTION_QUEUE_ITEMS_SCHEMA.properties.status).toMatchObject({
      type: 'string',
      enum: ['PENDING_REVIEW', 'UNMATCHED'],
    });
  });

  it('passes page, limit, search and status through to the query service', async () => {
    const { tool, queryService, tenantContext } = buildTool();

    await runInTenant(tenantContext, () =>
      tool.execute({
        page: 2,
        limit: 5,
        search: '  HD-1  ',
        status: 'UNMATCHED',
      }),
    );

    expect(queryService.execute).toHaveBeenCalledWith(
      2,
      5,
      'HD-1',
      'UNMATCHED',
    );
  });

  it('defaults page to 1 and limit to 10', async () => {
    const { tool, queryService, tenantContext } = buildTool();

    await runInTenant(tenantContext, () => tool.execute({}));

    expect(queryService.execute).toHaveBeenCalledWith(
      1,
      10,
      undefined,
      undefined,
    );
  });

  it('reads the queue inside the caller tenant, with no cross-tenant parameter', async () => {
    const { tool, queryService, tenantContext } = buildTool({
      items: [],
      total: 0,
    });
    let organizationIdAtQuery: string | undefined;
    queryService.execute.mockImplementation(() => {
      organizationIdAtQuery = tenantContext.getOrganizationId();
      return Promise.resolve({ items: [], total: 0, page: 1, limit: 10 });
    });

    await tenantContext.run(
      { userId: 'u-2', organizationId: 'org-2', role: Role.ACCOUNTANT },
      () => tool.execute({}),
    );

    expect(organizationIdAtQuery).toBe('org-2');
    // The tool takes no organization argument: tenant scope can only come
    // from the request context the repositories read.
    expect(queryService.execute).toHaveBeenCalledWith(
      1,
      10,
      undefined,
      undefined,
    );
  });

  it('fails before querying when there is no tenant context', async () => {
    const { tool, queryService } = buildTool();

    await expect(tool.execute({})).rejects.toThrow(
      'TenantContextService accessed outside of an authenticated request',
    );
    expect(queryService.execute).not.toHaveBeenCalled();
  });

  it('rejects invalid page, limit, search and status values', async () => {
    const { tool, queryService, tenantContext } = buildTool();

    for (const input of [
      { page: 0 },
      { page: 1.5 },
      { page: '2' },
      { limit: 11 },
      { limit: 0 },
      { search: 'x'.repeat(MAX_SEARCH_LENGTH + 1) },
      { status: 'MATCHED' },
    ]) {
      await expect(
        runInTenant(tenantContext, () => tool.execute(input)),
      ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
    }
    expect(queryService.execute).not.toHaveBeenCalled();
  });

  it('maps only the agreed fields and drops UUIDs, scores and provider internals', async () => {
    const view = {
      transaction: transaction(),
      topCandidate: {
        candidate: candidate(),
        invoiceNumber: 'HD-1',
        customerName: 'Công ty Alpha',
        remainingAmount: 12_500_000,
        dueDate: new Date('2026-12-01T00:00:00.000Z'),
      },
      isAmbiguous: true,
      aiRecommendation: {
        status: 'SUCCEEDED' as const,
        recommendedReceivableId: 'rec-1',
        confidence: 95,
        reason: 'Số tiền và nội dung khớp hóa đơn HD-1.',
        isCurrent: true,
      },
      payer: {
        accountNumberMasked: '******6789',
        name: 'NGUYEN VAN A',
        linkedCustomers: [
          { customerId: 'cust-1', customerName: 'Công ty Alpha' },
        ],
      },
    };
    const { tool, tenantContext } = buildTool({
      items: [view],
      total: 1,
      page: 1,
      limit: 10,
    });

    const result = await runInTenant(tenantContext, () => tool.execute({}));

    expect(result).toEqual({
      items: [
        {
          amount: 12_500_000,
          date: '2026-11-20T09:30:00.000Z',
          transferContent: 'CK HD-1 thanh toan',
          status: 'PENDING_REVIEW',
          isAmbiguousMatch: true,
          hasMatchingCandidate: true,
          candidate: {
            customerName: 'Công ty Alpha',
            invoiceNumber: 'HD-1',
            remainingAmount: 12_500_000,
          },
          aiMatchingRecommendationReason:
            'Số tiền và nội dung khớp hóa đơn HD-1.',
          payerName: 'NGUYEN VAN A',
          payerLinkedCustomers: ['Công ty Alpha'],
        },
      ],
      page: 1,
      hasMore: false,
    });

    const serialized = JSON.stringify(result);
    for (const hidden of [
      'bt-1',
      'mc-1',
      'rec-1',
      'cust-1',
      'conn-1',
      'inbox-1',
      'totalScore',
      'confidence',
      'recommendedReceivableId',
      'accountNumberMasked',
      'model',
      'failureCode',
      'gpt-4o-mini',
    ]) {
      expect(serialized).not.toContain(hidden);
    }
  });

  it('marks a transfer without a candidate as having no matching candidate', async () => {
    const view = {
      transaction: transaction({ status: 'UNMATCHED' }),
      topCandidate: null,
      isAmbiguous: false,
      aiRecommendation: null,
      payer: {
        accountNumberMasked: '',
        name: '',
        linkedCustomers: [],
      },
    };
    const { tool, tenantContext } = buildTool({ items: [view], total: 1 });

    const result = await runInTenant(tenantContext, () => tool.execute({}));

    expect(result.items[0]).toMatchObject({
      status: 'UNMATCHED',
      isAmbiguousMatch: false,
      hasMatchingCandidate: false,
      candidate: null,
      aiMatchingRecommendationReason: null,
      payerName: '',
      payerLinkedCustomers: [],
    });
  });

  it('drops the reason of an ABSTAINED AI matching recommendation', async () => {
    const { tool, tenantContext } = buildTool({
      items: [
        {
          transaction: transaction({ status: 'UNMATCHED' }),
          topCandidate: null,
          isAmbiguous: false,
          aiRecommendation: {
            status: 'ABSTAINED' as const,
            recommendedReceivableId: null,
            confidence: null,
            reason: 'Chưa đủ thông tin để đề xuất.',
            isCurrent: true,
          },
          payer: { accountNumberMasked: '', name: '', linkedCustomers: [] },
        },
      ],
      total: 1,
    });

    const result = await runInTenant(tenantContext, () => tool.execute({}));

    expect(result.items[0].aiMatchingRecommendationReason).toBeNull();
  });

  it('drops a SUCCEEDED reason whose recommended receivable is no longer open', async () => {
    const { tool, tenantContext } = buildTool({
      items: [
        {
          transaction: transaction(),
          topCandidate: {
            candidate: candidate(),
            invoiceNumber: 'HD-1',
            customerName: 'Công ty Alpha',
            remainingAmount: 12_500_000,
            dueDate: new Date('2026-12-01T00:00:00.000Z'),
          },
          isAmbiguous: false,
          aiRecommendation: {
            status: 'SUCCEEDED' as const,
            recommendedReceivableId: 'rec-1',
            confidence: 85,
            reason: 'Số tiền khớp hóa đơn HD-1.',
            isCurrent: false,
          },
          payer: { accountNumberMasked: '', name: '', linkedCustomers: [] },
        },
      ],
      total: 1,
    });

    const result = await runInTenant(tenantContext, () => tool.execute({}));

    expect(result.items[0].aiMatchingRecommendationReason).toBeNull();
  });

  it('keeps the reason of a current SUCCEEDED AI matching recommendation', async () => {
    const { tool, tenantContext } = buildTool({
      items: [
        {
          transaction: transaction(),
          topCandidate: {
            candidate: candidate(),
            invoiceNumber: 'HD-1',
            customerName: 'Công ty Alpha',
            remainingAmount: 12_500_000,
            dueDate: new Date('2026-12-01T00:00:00.000Z'),
          },
          isAmbiguous: false,
          aiRecommendation: {
            status: 'SUCCEEDED' as const,
            recommendedReceivableId: 'rec-1',
            confidence: 85,
            reason: 'Số tiền khớp hóa đơn HD-1.',
            isCurrent: true,
          },
          payer: { accountNumberMasked: '', name: '', linkedCustomers: [] },
        },
      ],
      total: 1,
    });

    const result = await runInTenant(tenantContext, () => tool.execute({}));

    expect(result.items[0].aiMatchingRecommendationReason).toBe(
      'Số tiền khớp hóa đơn HD-1.',
    );
  });

  it('returns an empty page when the Exception Queue has no transfers', async () => {
    const { tool, tenantContext } = buildTool({ items: [], total: 0 });

    await expect(
      runInTenant(tenantContext, () => tool.execute({})),
    ).resolves.toEqual({
      items: [],
      page: 1,
      hasMore: false,
    });
  });

  it('derives hasMore from the service total', async () => {
    const { tool, queryService, tenantContext } = buildTool({
      total: 25,
      page: 2,
      limit: 10,
    });

    const secondPage = await runInTenant(tenantContext, () =>
      tool.execute({ page: 2 }),
    );
    expect(secondPage.hasMore).toBe(true);
    expect(queryService.execute).toHaveBeenCalledWith(
      2,
      10,
      undefined,
      undefined,
    );

    queryService.execute.mockResolvedValueOnce({
      items: [],
      total: 25,
      page: 3,
      limit: 10,
    });
    const thirdPage = await runInTenant(tenantContext, () =>
      tool.execute({ page: 3 }),
    );
    expect(thirdPage.hasMore).toBe(false);
  });
});
