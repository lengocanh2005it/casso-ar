import { AppError } from '../../../../common/errors/app-error';
import { ErrorCode } from '../../../../common/errors/error-code';
import { TenantContextService } from '../../../../common/tenancy/tenant-context';
import { MAX_SEARCH_LENGTH } from '../../../../common/validation/search-length';
import type {
  ReceivableCombinationSuggestionsView,
  UnmatchedBankTransactionsQueryService,
} from '../../../exception-queue/application/unmatched-bank-transactions-query.service';
import { Role } from '../../../organizations/domain/membership';
import {
  GET_RECEIVABLE_COMBINATION_SUGGESTIONS_SCHEMA,
  GetReceivableCombinationSuggestionsTool,
} from './get-receivable-combination-suggestions.tool';

function buildTool(
  view: ReceivableCombinationSuggestionsView = {
    status: 'COMPLETE',
    combinations: [],
  },
) {
  const queryService = {
    combinationSuggestions: jest.fn().mockResolvedValue(view),
  };
  const customerRepo = {
    findIdsByExactName: jest.fn().mockResolvedValue([]),
  };
  const receivableRepo = {
    findByIds: jest.fn().mockImplementation((ids: string[]) =>
      Promise.resolve(
        new Map(
          ids.map((id) => [
            id,
            {
              id,
              originalAmount: id === 'rec-2' ? 7_500_000 : 5_000_000,
            },
          ]),
        ),
      ),
    ),
  };
  const tenantContext = new TenantContextService();
  const tool = new GetReceivableCombinationSuggestionsTool(
    queryService as unknown as UnmatchedBankTransactionsQueryService,
    customerRepo as never,
    receivableRepo as never,
    tenantContext,
  );
  return { tool, queryService, customerRepo, receivableRepo, tenantContext };
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

function completeView(): ReceivableCombinationSuggestionsView {
  return {
    status: 'COMPLETE',
    combinations: [
      {
        receivables: [
          {
            receivableId: 'rec-1',
            customerId: 'cust-1',
            customerName: 'Công ty Alpha',
            invoiceNumber: 'HD-1',
            remainingAmount: 5_000_000,
            dueDate: new Date('2026-12-01T00:00:00.000Z'),
          },
          {
            receivableId: 'rec-2',
            customerId: 'cust-1',
            customerName: 'Công ty Alpha',
            invoiceNumber: 'HD-2',
            remainingAmount: 7_500_000,
            dueDate: new Date('2026-12-15T00:00:00.000Z'),
          },
        ],
      },
    ],
  };
}

describe('GetReceivableCombinationSuggestionsTool', () => {
  it('declares a bounded schema', () => {
    expect(GetReceivableCombinationSuggestionsTool.NAME).toBe(
      'getReceivableCombinationSuggestions',
    );
    const properties = GET_RECEIVABLE_COMBINATION_SUGGESTIONS_SCHEMA.properties;
    expect(properties.bankTransactionId).toMatchObject({ type: 'string' });
    expect(properties.customerName).toMatchObject({
      type: 'string',
      maxLength: MAX_SEARCH_LENGTH,
    });
    expect(GET_RECEIVABLE_COMBINATION_SUGGESTIONS_SCHEMA.required).toEqual([
      'bankTransactionId',
    ]);
  });

  it('forwards the transfer id and no customer to the query service', async () => {
    const { tool, queryService, tenantContext } = buildTool();

    await runInTenant(tenantContext, () =>
      tool.execute({ bankTransactionId: 'bt-1' }),
    );

    expect(queryService.combinationSuggestions).toHaveBeenCalledWith('bt-1');
  });

  it('rejects a missing transfer id and overlong customer name', async () => {
    const { tool, queryService, tenantContext } = buildTool();

    await expect(
      runInTenant(tenantContext, () => tool.execute({})),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
    await expect(
      runInTenant(tenantContext, () =>
        tool.execute({
          bankTransactionId: 'bt-1',
          customerName: 'x'.repeat(MAX_SEARCH_LENGTH + 1),
        }),
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
    expect(queryService.combinationSuggestions).not.toHaveBeenCalled();
  });

  it('returns complete groups with amounts but no internal ids', async () => {
    const { tool, tenantContext } = buildTool(completeView());

    const result = await runInTenant(tenantContext, () =>
      tool.execute({ bankTransactionId: 'bt-1' }),
    );

    expect(result).toEqual({
      status: 'complete',
      groups: [
        {
          receivables: [
            {
              invoiceNumber: 'HD-1',
              faceAmount: 5_000_000,
              remainingAmount: 5_000_000,
            },
            {
              invoiceNumber: 'HD-2',
              faceAmount: 7_500_000,
              remainingAmount: 7_500_000,
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('rec-1');
    expect(JSON.stringify(result)).not.toContain('cust-1');
    expect(JSON.stringify(result)).not.toContain('bt-1');
  });

  it('resolves one exact customer name and re-queries with the id', async () => {
    const { tool, queryService, customerRepo, tenantContext } = buildTool({
      status: 'CUSTOMER_REQUIRED',
      combinations: [],
    });
    customerRepo.findIdsByExactName.mockResolvedValue(['cust-1']);
    queryService.combinationSuggestions
      .mockResolvedValueOnce({ status: 'CUSTOMER_REQUIRED', combinations: [] })
      .mockResolvedValueOnce(completeView());

    const result = await runInTenant(tenantContext, () =>
      tool.execute({
        bankTransactionId: 'bt-1',
        customerName: '  công ty alpha  ',
      }),
    );

    expect(customerRepo.findIdsByExactName).toHaveBeenCalledWith(
      'org-1',
      'công ty alpha',
      2,
    );
    expect(queryService.combinationSuggestions).toHaveBeenLastCalledWith(
      'bt-1',
      'cust-1',
    );
    expect(result.status).toBe('complete');
  });

  it('uses the exact-name lookup bounded to two results', async () => {
    const { tool, customerRepo, tenantContext } = buildTool({
      status: 'CUSTOMER_REQUIRED',
      combinations: [],
    });
    customerRepo.findIdsByExactName.mockResolvedValue([]);

    await runInTenant(tenantContext, () =>
      tool.execute({
        bankTransactionId: 'bt-1',
        customerName: 'Công ty Alpha',
      }),
    );

    expect(customerRepo.findIdsByExactName).toHaveBeenCalledWith(
      'org-1',
      'công ty alpha',
      2,
    );
  });

  it('keeps customer_required when the exact name is missing or ambiguous', async () => {
    for (const ids of [[], ['cust-1', 'cust-2']]) {
      const { tool, queryService, customerRepo, tenantContext } = buildTool({
        status: 'CUSTOMER_REQUIRED',
        combinations: [],
      });
      customerRepo.findIdsByExactName.mockResolvedValue(ids);

      const result = await runInTenant(tenantContext, () =>
        tool.execute({
          bankTransactionId: 'bt-1',
          customerName: 'Công ty Alpha',
        }),
      );
      expect(result).toEqual({ status: 'customer_required', groups: [] });
      expect(queryService.combinationSuggestions).toHaveBeenCalledTimes(1);
    }
  });

  it('maps a known AppError to unavailable but rethrows programmer errors', async () => {
    const { tool, queryService, tenantContext } = buildTool();
    queryService.combinationSuggestions.mockRejectedValue(
      new AppError(ErrorCode.CONFLICT, 'Giao dịch không còn chờ xử lý.'),
    );
    await expect(
      runInTenant(tenantContext, () =>
        tool.execute({ bankTransactionId: 'bt-1' }),
      ),
    ).resolves.toEqual({ status: 'unavailable', groups: [] });

    queryService.combinationSuggestions.mockRejectedValue(new Error('db down'));
    await expect(
      runInTenant(tenantContext, () =>
        tool.execute({ bankTransactionId: 'bt-1' }),
      ),
    ).rejects.toThrow('db down');
  });

  it('reports incomplete and empty complete searches distinctly', async () => {
    const incomplete = buildTool({ status: 'INCOMPLETE', combinations: [] });
    const incompleteResult = await runInTenant(incomplete.tenantContext, () =>
      incomplete.tool.execute({ bankTransactionId: 'bt-1' }),
    );
    expect(incompleteResult).toEqual({ status: 'incomplete', groups: [] });

    const empty = buildTool({ status: 'COMPLETE', combinations: [] });
    const emptyResult = await runInTenant(empty.tenantContext, () =>
      empty.tool.execute({ bankTransactionId: 'bt-1' }),
    );
    expect(emptyResult).toEqual({ status: 'complete', groups: [] });
  });
});
