import { PreviewCassoFlowAccountsUseCase } from './preview-casso-flow-accounts.usecase';

describe('PreviewCassoFlowAccountsUseCase', () => {
  it('classifies each account as AVAILABLE / ALREADY_CONNECTED / TAKEN_BY_ANOTHER_ORG', async () => {
    const adapter = {
      getAccountInfo: jest.fn().mockResolvedValue({
        businessId: 'biz-1',
        accounts: [
          { accountNumber: '111', bankName: 'Bank A', accountHolderName: 'A' },
          { accountNumber: '222', bankName: 'Bank B', accountHolderName: 'B' },
          { accountNumber: '333', bankName: 'Bank C', accountHolderName: 'C' },
        ],
      }),
    };
    const bankConnectionRepo = {
      findByAccountNumbers: jest.fn().mockResolvedValue(
        new Map([
          ['111', { organizationId: 'org-1' }],
          ['222', { organizationId: 'org-2' }],
        ]),
      ),
    };
    const useCase = new PreviewCassoFlowAccountsUseCase(
      adapter as never,
      bankConnectionRepo as never,
    );

    const result = await useCase.execute({
      organizationId: 'org-1',
      apiKey: 'key-1',
    });

    expect(result.businessId).toBe('biz-1');
    expect(result.accounts).toEqual([
      {
        accountNumber: '111',
        bankName: 'Bank A',
        accountHolderName: 'A',
        status: 'ALREADY_CONNECTED',
      },
      {
        accountNumber: '222',
        bankName: 'Bank B',
        accountHolderName: 'B',
        status: 'TAKEN_BY_ANOTHER_ORG',
      },
      {
        accountNumber: '333',
        bankName: 'Bank C',
        accountHolderName: 'C',
        status: 'AVAILABLE',
      },
    ]);
    expect(bankConnectionRepo.findByAccountNumbers).toHaveBeenCalledWith([
      '111',
      '222',
      '333',
    ]);
    expect(adapter.getAccountInfo).toHaveBeenCalledWith('key-1');
  });
});
