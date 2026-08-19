import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BalanceHookDto } from './balance-hook.dto';

const validPayload = {
  environment: 'dev',
  webhookType: 'TRANSACTIONS',
  webhookCode: 'DEFAULT_UPDATE',
  error: null,
  grantId: '4c657924-13f3-11ee-a4bb-42010a40001b',
  transaction: {
    id: '3cacecf6935011ee952542010a400022',
    transactionCode: '993UNdEHhIgfy3I',
    reference: null,
    transactionDate: '2023-12-05',
    transactionDateTime: '2023-12-05T16:25:00+07:00',
    bookingDate: '2023-12-05',
    amount: 10000,
    description: 'test',
    runningBalance: 3330000,
    accountNumber: 867623232,
    virtualAccountNumber: null,
    virtualAccountName: null,
    paymentChannel: null,
    counterAccountNumber: null,
    counterAccountName: null,
    counterAccountBankId: null,
    counterAccountBankName: null,
    paymentMeta: null,
    fiId: '3c26a8ed-efb5-11ed-8620-0ae7e48c82d8',
    fiName: 'VietinBank',
    fiServiceId: '433f71c4-efb5-11ed-8620-0ae7e48c82d8',
    fiServiceName: 'VietinBank iPay - Official API',
    currency: 'VND',
  },
};

describe('BalanceHookDto', () => {
  it('accepts the real Balance Hook payload verbatim, including nullable counterparty fields', async () => {
    const dto = plainToInstance(BalanceHookDto, validPayload);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.transaction.counterAccountNumber).toBeNull();
    expect(dto.transaction.counterAccountName).toBeNull();
  });

  it('accepts a populated counterAccountNumber even as a raw JSON number', async () => {
    const dto = plainToInstance(BalanceHookDto, {
      ...validPayload,
      transaction: {
        ...validPayload.transaction,
        counterAccountNumber: 1234567,
      },
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a payload missing grantId', async () => {
    const { grantId, ...withoutGrantId } = validPayload;
    const dto = plainToInstance(BalanceHookDto, withoutGrantId);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'grantId')).toBe(true);
  });

  it('rejects a payload missing transaction.id', async () => {
    const { id, ...transactionWithoutId } = validPayload.transaction;
    const dto = plainToInstance(BalanceHookDto, {
      ...validPayload,
      transaction: transactionWithoutId,
    });
    const errors = await validate(dto, { validationError: { target: false } });
    const transactionErrors = errors.find((e) => e.property === 'transaction');
    expect(transactionErrors?.children?.some((c) => c.property === 'id')).toBe(
      true,
    );
  });
});
