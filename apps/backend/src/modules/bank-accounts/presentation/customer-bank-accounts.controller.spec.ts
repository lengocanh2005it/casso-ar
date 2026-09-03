import { CustomerBankAccount } from '../domain/customer-bank-account';
import {
  CreateCustomerBankAccountDto,
  UpdateCustomerBankAccountDto,
} from './customer-bank-account.dto';
import { CustomerBankAccountsController } from './customer-bank-accounts.controller';

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

function buildController(
  currentUser: { userId: string } | null = { userId: 'user-1' },
) {
  const list = { execute: jest.fn() };
  const create = { execute: jest.fn() };
  const update = { execute: jest.fn() };
  const deactivate = { execute: jest.fn() };
  const idempotency = {
    execute: jest.fn(
      async (
        _endpoint: string,
        _key: string | undefined,
        _input: unknown,
        operation: () => Promise<unknown>,
      ) => operation(),
    ),
  };
  const tenantContext = {
    getCurrentUser: jest.fn().mockReturnValue(currentUser),
  };
  return {
    controller: new CustomerBankAccountsController(
      list as never,
      create as never,
      update as never,
      deactivate as never,
      idempotency as never,
      tenantContext as never,
    ),
    list,
    create,
    update,
    deactivate,
    idempotency,
    tenantContext,
  };
}

describe('CustomerBankAccountsController', () => {
  it('returns only masked account data', async () => {
    const { controller, list } = buildController();
    list.execute.mockResolvedValue({ items: [buildAccount()], total: 1 });

    const result = await controller.list('cust-1');

    expect(result).toEqual({
      items: [expect.objectContaining({ accountNumberMasked: '******2233' })],
      total: 1,
    });
    expect(JSON.stringify(result)).not.toContain('0011002233');
    expect(list.execute).toHaveBeenCalledWith({ customerId: 'cust-1' });
  });

  it('wraps create in idempotency and never returns the raw account number', async () => {
    const { controller, create, idempotency } = buildController();
    create.execute.mockResolvedValue(buildAccount());
    const dto: CreateCustomerBankAccountDto = {
      accountNumber: '0011 0022-33',
    };

    const result = await controller.create('key-1', 'cust-1', dto);

    expect(result).toEqual(
      expect.objectContaining({ accountNumberMasked: '******2233' }),
    );
    expect(JSON.stringify(result)).not.toContain('0011002233');
    expect(idempotency.execute).toHaveBeenCalledWith(
      'POST /customers/cust-1/bank-accounts',
      'key-1',
      dto,
      expect.any(Function),
    );
    expect(create.execute).toHaveBeenCalledWith({
      customerId: 'cust-1',
      accountNumber: dto.accountNumber,
      acknowledgeExistingLinks: undefined,
      confirmedByUserId: 'user-1',
    });
  });

  it('delegates update and deactivate through idempotency', async () => {
    const { controller, update, deactivate, idempotency } = buildController();
    update.execute.mockResolvedValue(buildAccount());
    deactivate.execute.mockResolvedValue(buildAccount({ isActive: false }));
    const updateDto: UpdateCustomerBankAccountDto = { isActive: true };

    await controller.update('key-2', 'cust-1', 'account-1', updateDto);
    await controller.deactivate('key-3', 'cust-1', 'account-1');

    expect(update.execute).toHaveBeenCalledWith({
      id: 'account-1',
      customerId: 'cust-1',
      isActive: true,
      confirmedByUserId: 'user-1',
    });
    expect(deactivate.execute).toHaveBeenCalledWith({
      id: 'account-1',
      customerId: 'cust-1',
    });
    expect(idempotency.execute).toHaveBeenCalledWith(
      'PATCH /customers/cust-1/bank-accounts/account-1',
      'key-2',
      updateDto,
      expect.any(Function),
    );
    expect(idempotency.execute).toHaveBeenCalledWith(
      'DELETE /customers/cust-1/bank-accounts/account-1',
      'key-3',
      { id: 'account-1' },
      expect.any(Function),
    );
  });

  it('forwards acknowledgeExistingLinks and the acting user to the create use case', async () => {
    const { controller, create } = buildController({ userId: 'user-7' });
    create.execute.mockResolvedValue(buildAccount());

    await controller.create('key-1', 'cust-1', {
      accountNumber: '0123456789',
      acknowledgeExistingLinks: true,
    });

    expect(create.execute).toHaveBeenCalledWith({
      customerId: 'cust-1',
      accountNumber: '0123456789',
      acknowledgeExistingLinks: true,
      confirmedByUserId: 'user-7',
    });
  });
});
