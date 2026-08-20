import { verifyCassoWebhookSignature } from './casso-webhook-signature';

const payload = {
  error: 0,
  data: {
    id: 218897,
    reference: 'FT24364030863634',
    description: 'hoi lai 100 bao mun dua',
    amount: 16_775_000,
    runningBalance: 16_775_000,
    transactionDateTime: '2024-12-23 07:00:00',
    accountNumber: '123456789',
    bankName: 'MBBank',
    bankAbbreviation: 'MBB',
    virtualAccountNumber: '',
    virtualAccountName: '',
    counterAccountName: '',
    counterAccountNumber: '',
    counterAccountBankId: '',
    counterAccountBankName: '',
  },
};

describe('verifyCassoWebhookSignature', () => {
  it('accepts a signature produced by the official Casso Webhook V2 algorithm', () => {
    expect(
      verifyCassoWebhookSignature({
        payload,
        secret:
          'g3oZ950pJQ4k6REhOPGkx37RsXgWz9QJ9RCAZ7i0yagLF32XQZtemQ6r3JIo4MCr',
        signatureHeader:
          't=1734924830020,v1=b3d9438862f167b4e441451b46adaff01f4aaa0c05fa86df1803b7452616c449b9f69837be23b76f79862b346c8bc90a4f1152397a886d4ec24e857cdf6ad08f',
      }),
    ).toBe(true);
  });

  it('rejects a payload changed after signing', () => {
    expect(
      verifyCassoWebhookSignature({
        payload: { ...payload, data: { ...payload.data, amount: 1 } },
        secret:
          'g3oZ950pJQ4k6REhOPGkx37RsXgWz9QJ9RCAZ7i0yagLF32XQZtemQ6r3JIo4MCr',
        signatureHeader:
          't=1734924830020,v1=b3d9438862f167b4e441451b46adaff01f4aaa0c05fa86df1803b7452616c449b9f69837be23b76f79862b346c8bc90a4f1152397a886d4ec24e857cdf6ad08f',
      }),
    ).toBe(false);
  });

  it('rejects a missing or malformed signature header', () => {
    expect(
      verifyCassoWebhookSignature({
        payload,
        secret: 'secret',
        signatureHeader: '',
      }),
    ).toBe(false);
    expect(
      verifyCassoWebhookSignature({
        payload,
        secret: 'secret',
        signatureHeader: 'v1=not-a-timestamp',
      }),
    ).toBe(false);
  });
});
