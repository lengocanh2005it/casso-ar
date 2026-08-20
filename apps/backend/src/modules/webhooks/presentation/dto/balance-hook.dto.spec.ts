import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BalanceHookDto } from './balance-hook.dto';

const validPayload = {
  error: 0,
  data: {
    id: 0,
    reference: 'MA_GIAO_DICH_THU_NGHIEM',
    description: 'giao dich thu nghiem',
    amount: 599000,
    runningBalance: 25000000,
    transactionDateTime: '2025-02-12 15:36:21',
    accountNumber: '88888888',
    bankName: 'VPBank',
    bankAbbreviation: 'VPB',
    virtualAccountNumber: '',
    virtualAccountName: '',
    counterAccountName: 'NGUYEN VAN A',
    counterAccountNumber: '8888888888',
    counterAccountBankId: '970415',
    counterAccountBankName: 'VietinBank',
  },
};

describe('BalanceHookDto', () => {
  it('accepts the real Casso Flow payload verbatim', async () => {
    const dto = plainToInstance(BalanceHookDto, validPayload);
    const errors = await validate(dto, { whitelist: true });
    expect(errors).toHaveLength(0);
    expect(dto.data.accountNumber).toBe('88888888');
    expect(Object.hasOwn(dto.data, 'bankAbbreviation')).toBe(true);
    expect(Object.hasOwn(dto.data, 'counterAccountBankName')).toBe(true);
  });

  it('accepts empty-string counterparty fields', async () => {
    const dto = plainToInstance(BalanceHookDto, {
      ...validPayload,
      data: {
        ...validPayload.data,
        counterAccountName: '',
        counterAccountNumber: '',
      },
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a payload missing data.accountNumber', async () => {
    const { accountNumber, ...dataWithoutAccountNumber } = validPayload.data;
    const dto = plainToInstance(BalanceHookDto, {
      ...validPayload,
      data: dataWithoutAccountNumber,
    });
    const errors = await validate(dto, { validationError: { target: false } });
    const dataErrors = errors.find((e) => e.property === 'data');
    expect(
      dataErrors?.children?.some((c) => c.property === 'accountNumber'),
    ).toBe(true);
  });
});
