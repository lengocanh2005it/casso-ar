import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { CustomerBankAccount } from '../domain/customer-bank-account';

import { CreateCustomerBankAccountUseCase } from './create-customer-bank-account.usecase';
import { DeactivateCustomerBankAccountUseCase } from './deactivate-customer-bank-account.usecase';
import { ListCustomerBankAccountsUseCase } from './list-customer-bank-accounts.usecase';
import { UpdateCustomerBankAccountUseCase } from './update-customer-bank-account.usecase';

const manager = { name: 'transaction-manager' };

const dataSource = {
  transaction: jest.fn(async (callback: (value: typeof manager) => unknown) =>
    callback(manager),
  ),
};

const tenantContext = {
  getOrganizationId: jest.fn().mockReturnValue('org-1'),
};

function buildAccount(
  overrides: Partial<ConstructorParameters<typeof CustomerBankAccount>[0]> = {},
): CustomerBankAccount {
  return new CustomerBankAccount({
    id: 'account-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    accountNumber: '0011002233',
    isActive: true,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  });
}

function buildCreateUseCase(
  customerRepo: Record<string, jest.Mock>,
  bankAccountRepo: Record<string, jest.Mock>,
) {
  return new CreateCustomerBankAccountUseCase(
    bankAccountRepo as never,
    customerRepo as never,
    tenantContext as never,
    dataSource as never,
  );
}

function buildUpdateUseCase(
  bankAccountRepo: Record<string, jest.Mock>,
  auditContext = { setBefore: jest.fn() },
) {
  return new UpdateCustomerBankAccountUseCase(
    bankAccountRepo as never,
    dataSource as never,
    auditContext as never,
  );
}

function buildDeactivateUseCase(
  bankAccountRepo: Record<string, jest.Mock>,
  auditContext = { setBefore: jest.fn() },
) {
  return new DeactivateCustomerBankAccountUseCase(
    bankAccountRepo as never,
    dataSource as never,
    auditContext as never,
  );
}

describe('customer bank account use cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists tenant customer mappings after validating the customer', async () => {
    const accounts = [buildAccount()];
    const customerRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'cust-1' }),
    };
    const bankAccountRepo = {
      findByCustomerId: jest.fn().mockResolvedValue(accounts),
    };
    const useCase = new ListCustomerBankAccountsUseCase(
      customerRepo as never,
      bankAccountRepo as never,
    );

    await expect(useCase.execute({ customerId: 'cust-1' })).resolves.toEqual({
      items: accounts,
      total: 1,
    });
    expect(customerRepo.findById).toHaveBeenCalledWith('cust-1');
    expect(bankAccountRepo.findByCustomerId).toHaveBeenCalledWith('cust-1');
  });

  it('creates a normalized mapping only for an existing tenant customer', async () => {
    const customerRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'cust-1' }),
    };
    const bankAccountRepo = {
      findById: jest.fn(),
      findByCustomerId: jest.fn(),
      findActiveByAccountNumber: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
    };
    const useCase = buildCreateUseCase(customerRepo, bankAccountRepo);

    const result = await useCase.execute({
      customerId: 'cust-1',
      accountNumber: '0011 0022-33',
      confirmedByUserId: 'user-1',
    });

    expect(result.accountNumber).toBe('0011002233');
    expect(bankAccountRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        accountNumber: '0011002233',
        isActive: true,
      }),
      manager,
    );
  });

  it('rejects a duplicate normalized account number', async () => {
    const useCase = buildCreateUseCase(
      { findById: jest.fn().mockResolvedValue({ id: 'cust-1' }) },
      {
        findActiveByAccountNumber: jest
          .fn()
          .mockResolvedValue([buildAccount({ customerId: 'cust-1' })]),
      },
    );

    await expect(
      useCase.execute({
        customerId: 'cust-1',
        accountNumber: '0011002233',
        confirmedByUserId: 'user-1',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
  });

  it('propagates a conflict AppError raised by the repository on save', async () => {
    const conflictError = new AppError(
      ErrorCode.CONFLICT,
      'Số tài khoản ngân hàng đã được liên kết.',
    );
    const bankAccountRepo = {
      findActiveByAccountNumber: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockRejectedValue(conflictError),
    };
    const useCase = buildCreateUseCase(
      { findById: jest.fn().mockResolvedValue({ id: 'cust-1' }) },
      bankAccountRepo,
    );

    await expect(
      useCase.execute({
        customerId: 'cust-1',
        accountNumber: '0011002233',
        confirmedByUserId: 'user-1',
      }),
    ).rejects.toBe(conflictError);
  });

  it('rejects a missing or cross-tenant customer without saving', async () => {
    const bankAccountRepo = { save: jest.fn() };
    const useCase = buildCreateUseCase(
      { findById: jest.fn().mockResolvedValue(null) },
      bankAccountRepo,
    );

    await expect(
      useCase.execute({
        customerId: 'other-customer',
        accountNumber: '0011002233',
        confirmedByUserId: 'user-1',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
    expect(bankAccountRepo.save).not.toHaveBeenCalled();
  });

  it('rejects invalid account numbers with a validation error', async () => {
    const useCase = buildCreateUseCase(
      { findById: jest.fn().mockResolvedValue({ id: 'cust-1' }) },
      { findActiveByAccountNumber: jest.fn(), save: jest.fn() },
    );

    await expect(
      useCase.execute({
        customerId: 'cust-1',
        accountNumber: 'not-an-account',
        confirmedByUserId: 'user-1',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
  });

  it('updates an account without allowing customer ownership to change', async () => {
    const account = buildAccount();
    const bankAccountRepo = {
      findById: jest.fn().mockResolvedValue(account),
      findByAccountNumber: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const useCase = buildUpdateUseCase(bankAccountRepo);

    await expect(
      useCase.execute({
        id: account.id,
        customerId: 'other-customer',
        isActive: false,
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
    expect(bankAccountRepo.save).not.toHaveBeenCalled();
  });

  it('rejects an update with no fields', async () => {
    const account = buildAccount();
    const useCase = buildUpdateUseCase({
      findById: jest.fn().mockResolvedValue(account),
      save: jest.fn(),
    });

    await expect(
      useCase.execute({ id: account.id, customerId: account.customerId }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
  });

  it('updates the normalized number and active state with a masked audit snapshot', async () => {
    const account = buildAccount();
    const auditContext = { setBefore: jest.fn() };
    const bankAccountRepo = {
      findById: jest.fn().mockResolvedValue(account),
      findByAccountNumber: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const useCase = buildUpdateUseCase(bankAccountRepo, auditContext);

    const result = await useCase.execute({
      id: account.id,
      customerId: account.customerId,
      accountNumber: '4455 6677',
      isActive: false,
    });

    expect(result).toMatchObject({
      accountNumber: '44556677',
      isActive: false,
      customerId: account.customerId,
    });
    expect(bankAccountRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ accountNumber: '44556677', isActive: false }),
      manager,
    );
    expect(auditContext.setBefore).toHaveBeenCalledWith({
      id: account.id,
      customerId: account.customerId,
      accountNumberMasked: '******2233',
      isActive: true,
    });
    expect(
      JSON.stringify(auditContext.setBefore.mock.calls[0][0]),
    ).not.toContain('0011002233');
  });

  it('deactivates without deleting the row and remains idempotent', async () => {
    const account = buildAccount({ isActive: true });
    const repo = {
      findById: jest.fn().mockResolvedValue(account),
      save: jest.fn(),
    };
    const useCase = buildDeactivateUseCase(repo);

    await useCase.execute({ customerId: account.customerId, id: account.id });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
      manager,
    );
  });

  it('does not save or create an audit snapshot when already inactive', async () => {
    const account = buildAccount({ isActive: false });
    const auditContext = { setBefore: jest.fn() };
    const repo = {
      findById: jest.fn().mockResolvedValue(account),
      save: jest.fn(),
    };
    const useCase = buildDeactivateUseCase(repo, auditContext);

    await expect(
      useCase.execute({ customerId: account.customerId, id: account.id }),
    ).resolves.toBe(account);
    expect(repo.save).not.toHaveBeenCalled();
    expect(auditContext.setBefore).not.toHaveBeenCalled();
  });

  it('rejects deactivation of a mapping from another customer or tenant', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const useCase = buildDeactivateUseCase(repo);

    await expect(
      useCase.execute({ customerId: 'other-customer', id: 'missing' }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects a duplicate account number on update', async () => {
    const account = buildAccount();
    const repo = {
      findById: jest.fn().mockResolvedValue(account),
      findByAccountNumber: jest
        .fn()
        .mockResolvedValue(buildAccount({ id: 'other-account' })),
      save: jest.fn(),
    };
    const useCase = buildUpdateUseCase(repo);

    await expect(
      useCase.execute({
        id: account.id,
        customerId: account.customerId,
        accountNumber: '44556677',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
    expect(repo.save).not.toHaveBeenCalled();
  });
});

describe('CreateCustomerBankAccountUseCase — cross-customer links', () => {
  function makeLink(
    overrides: Partial<
      ConstructorParameters<typeof CustomerBankAccount>[0]
    > = {},
  ): CustomerBankAccount {
    return new CustomerBankAccount({
      id: 'link-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      accountNumber: '0123456789',
      isActive: true,
      confirmedByUserId: 'user-1',
      confirmedAt: new Date('2026-09-01T00:00:00.000Z'),
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      ...overrides,
    });
  }

  let bankAccountRepo: {
    findActiveByAccountNumber: jest.Mock;
    save: jest.Mock;
  };
  let customerRepo: {
    findById: jest.Mock;
    findByIds: jest.Mock;
  };
  let useCase: CreateCustomerBankAccountUseCase;

  beforeEach(() => {
    bankAccountRepo = {
      findActiveByAccountNumber: jest.fn(),
      save: jest.fn(),
    };
    customerRepo = {
      findById: jest.fn(),
      findByIds: jest.fn(),
    };
    useCase = buildCreateUseCase(customerRepo, bankAccountRepo as never);
  });

  it('rejects a link when the account is active on another customer and the caller has not acknowledged', async () => {
    bankAccountRepo.findActiveByAccountNumber.mockResolvedValue([
      makeLink({ customerId: 'cust-other', accountNumber: '0123456789' }),
    ]);
    customerRepo.findById.mockResolvedValue({
      id: 'cust-1',
      name: 'Cong ty A',
    });
    customerRepo.findByIds.mockResolvedValue(
      new Map([['cust-other', { name: 'Cong ty B' }]]),
    );

    await expect(
      useCase.execute({
        customerId: 'cust-1',
        accountNumber: '0123456789',
        confirmedByUserId: 'user-1',
      } as any),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
      details: { linkedCustomerNames: ['Cong ty B'] },
    });
    expect(bankAccountRepo.save).not.toHaveBeenCalled();
  });

  it('creates the link when acknowledged, stamping confirmation provenance', async () => {
    bankAccountRepo.findActiveByAccountNumber.mockResolvedValue([
      makeLink({ customerId: 'cust-other', accountNumber: '0123456789' }),
    ]);
    customerRepo.findById.mockResolvedValue({
      id: 'cust-1',
      name: 'Cong ty A',
    });

    const created = await useCase.execute({
      customerId: 'cust-1',
      accountNumber: '0123456789',
      acknowledgeExistingLinks: true,
      confirmedByUserId: 'user-1',
    } as any);

    expect(created.customerId).toBe('cust-1');
    expect(created.confirmedByUserId).toBe('user-1');
    expect(created.confirmedAt).toBeInstanceOf(Date);
    expect(bankAccountRepo.save).toHaveBeenCalledTimes(1);
  });

  it('rejects a second active link for the SAME customer regardless of the flag', async () => {
    bankAccountRepo.findActiveByAccountNumber.mockResolvedValue([
      makeLink({ customerId: 'cust-1', accountNumber: '0123456789' }),
    ]);
    customerRepo.findById.mockResolvedValue({
      id: 'cust-1',
      name: 'Cong ty A',
    });

    await expect(
      useCase.execute({
        customerId: 'cust-1',
        accountNumber: '0123456789',
        acknowledgeExistingLinks: true,
        confirmedByUserId: 'user-1',
      } as any),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
    expect(bankAccountRepo.save).not.toHaveBeenCalled();
  });

  it('creates a plain link with provenance when the account is unknown', async () => {
    bankAccountRepo.findActiveByAccountNumber.mockResolvedValue([]);
    customerRepo.findById.mockResolvedValue({
      id: 'cust-1',
      name: 'Cong ty A',
    });

    const created = await useCase.execute({
      customerId: 'cust-1',
      accountNumber: '0123456789',
      confirmedByUserId: 'user-1',
    } as any);

    expect(created.confirmedByUserId).toBe('user-1');
    expect(bankAccountRepo.save).toHaveBeenCalledTimes(1);
  });
});
